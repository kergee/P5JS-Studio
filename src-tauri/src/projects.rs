//! Project submission archives and transactional saves. These helpers also run
//! against isolated directories in tests, without touching application data.
use super::*;
use std::collections::{BTreeMap, HashSet};
use std::path::Path;

const MAX_ENTRIES: usize = 10_000;
const MAX_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;

fn safe_path(base: &PathBuf, rel: &str) -> Result<PathBuf, String> {
    if rel.replace('\\', "/").split('/').any(|part| part.is_empty() || part.trim() != part || part.ends_with('.') || part.chars().any(char::is_control)) {
        return Err("invalid path suffix".into());
    }
    let normalized = normalize_rel_path(rel)?;
    if normalized.is_empty() { return Err("empty file path".into()); }
    let mut path = base.clone();
    for part in normalized.split('/') {
        // Windows aliases can otherwise overwrite an apparently different file.
        if part.ends_with('.') || part.ends_with(' ') { return Err("invalid path suffix".into()); }
        let device = part.split('.').next().unwrap_or("").to_uppercase();
        if ["CON", "PRN", "AUX", "NUL"].contains(&device.as_str())
            || (device.len() == 4 && (device.starts_with("COM") || device.starts_with("LPT"))
                && matches!(device.as_bytes()[3], b'1'..=b'9')) {
            return Err("reserved file name".into());
        }
        path.push(part);
        if fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false) {
            return Err("symbolic links are not supported".into());
        }
    }
    Ok(path)
}

fn category_dir(base: &PathBuf, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() { return Ok(base.clone()); }
    let normalized = normalize_rel_path(rel)?;
    let mut prefix = String::new();
    for part in normalized.split('/') {
        prefix = join_rel_path(&prefix, part)?;
        let dir = safe_path(base, &prefix)?;
        if is_sketch_dir(&dir) || (prefix == "public") { return Err("select a category folder".into()); }
    }
    let dir = safe_path(base, rel)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn unique_name(dir: &Path, name: &str, skip: bool) -> Result<Option<String>, String> {
    validate_path_segment(name)?;
    if !dir.join(name).exists() { return Ok(Some(name.into())); }
    if skip { return Ok(None); }
    let path = Path::new(name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(name);
    let ext = path.extension().and_then(|s| s.to_str()).map(|s| format!(".{s}")).unwrap_or_default();
    for i in 2..100_000 {
        let candidate = format!("{stem} ({i}){ext}");
        if !dir.join(&candidate).exists() { return Ok(Some(candidate)); }
    }
    Err("too many duplicate names".into())
}

fn collect_files(dir: &PathBuf, prefix: &str, files: &mut BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        if ty.is_symlink() { return Err("cannot archive symbolic links".into()); }
        let name = entry.file_name().to_string_lossy().to_string();
        let rel = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
        if ty.is_dir() { collect_files(&entry.path(), &rel, files)?; }
        else if ty.is_file() { files.insert(rel, fs::read(entry.path()).map_err(|e| e.to_string())?); }
    }
    Ok(())
}

fn write_files(dir: &PathBuf, files: &BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    for (rel, bytes) in files {
        let path = safe_path(dir, rel)?;
        fs::create_dir_all(path.parent().ok_or("missing parent")?).map_err(|e| e.to_string())?;
        fs::write(path, bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn write_zip(dest: &str, files: &BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    let destination = Path::new(dest);
    let parent = destination.parent().ok_or("missing export directory")?;
    let temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    let mut writer = zip::ZipWriter::new(temp.reopen().map_err(|e| e.to_string())?);
    for (name, bytes) in files {
        writer.start_file(name, zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated))
            .map_err(|e| e.to_string())?;
        writer.write_all(bytes).map_err(|e| e.to_string())?;
    }
    writer.finish().map_err(|e| e.to_string())?.sync_all().map_err(|e| e.to_string())?;
    temp.persist(destination).map_err(|e| e.to_string())?;
    Ok(())
}

fn read_zip(zip_path: &str) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut archive = zip::ZipArchive::new(fs::File::open(zip_path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if archive.len() > MAX_ENTRIES { return Err("ZIP contains too many entries".into()); }
    let check_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let mut files = BTreeMap::new();
    let mut seen = HashSet::new();
    let mut total = 0u64;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let mode = file.unix_mode().unwrap_or(0) & 0o170000;
        if mode != 0 && mode != 0o100000 && mode != 0o040000 { return Err("ZIP links and special files are not supported".into()); }
        let raw = file.name().trim_end_matches('/');
        safe_path(&check_dir.path().to_path_buf(), raw)?;
        let name = normalize_rel_path(raw)?;
        if !seen.insert(name.to_lowercase()) { return Err("duplicate ZIP paths".into()); }
        if file.is_dir() { continue; }
        if file.size() > MAX_ARCHIVE_BYTES - total { return Err("ZIP exceeds 512 MB extracted size".into()); }
        let mut bytes = Vec::new();
        (&mut file).take(MAX_ARCHIVE_BYTES - total + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        total += bytes.len() as u64;
        if total > MAX_ARCHIVE_BYTES { return Err("ZIP exceeds 512 MB extracted size".into()); }
        files.insert(name, bytes);
    }
    if files.is_empty() { return Err("ZIP is empty".into()); }
    Ok(files)
}

fn validate_project_files(files: &BTreeMap<String, Vec<u8>>) -> Result<SketchMeta, String> {
    let meta: SketchMeta = serde_json::from_slice(files.get("meta.json").ok_or(
        "not a P5JS Studio project ZIP: ask the student to use Export Project ZIP; HTML conversion is planned for a later release"
    )?).map_err(|e| format!("invalid meta.json: {e}"))?;
    if meta.files.is_empty() { return Err("project has no JavaScript files".into()); }
    let mut seen = HashSet::new();
    for name in &meta.files {
        validate_path_segment(name)?;
        if name.contains('/') || !name.to_lowercase().ends_with(".js") || !seen.insert(name.to_lowercase()) {
            return Err("invalid code file list".into());
        }
        let bytes = files.get(name).ok_or_else(|| format!("missing code file: {name}"))?;
        std::str::from_utf8(bytes).map_err(|_| format!("code is not UTF-8: {name}"))?;
    }
    for library in &meta.libraries {
        if !library.starts_with("https://") && !library.starts_with("http://") && !library.starts_with("data:") {
            let name = normalize_rel_path(library.trim_start_matches("./"))?;
            if !files.contains_key(&name) { return Err(format!("missing library: {library}")); }
        }
    }
    Ok(meta)
}

fn project_archive(base: &PathBuf, sketch_name: &str) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let dir = safe_path(base, sketch_name)?;
    if !is_sketch_dir(&dir) { return Err("not a project".into()); }
    let meta = read_meta(&dir);
    let code = read_sketch_code(&dir, &meta);
    // Bundle shared assets at their existing relative paths, with local assets winning.
    let mut assets = HashMap::new();
    collect_sketch_assets(&base.join("public"), "", &mut assets, true);
    collect_declared_public_libraries(&base.join("public"), &meta.libraries, &code, &mut assets);
    let mut files = BTreeMap::new();
    for (path, data) in assets {
        let b64 = data.split_once(',').ok_or("invalid asset data")?.1;
        files.insert(path, STANDARD.decode(b64).map_err(|e| e.to_string())?);
    }
    collect_files(&dir, "", &mut files)?;
    files.insert("meta.json".into(), serde_json::to_vec_pretty(&meta).map_err(|e| e.to_string())?);
    validate_project_files(&files)?;
    Ok(files)
}

fn import_project_into(base: &PathBuf, zip_path: &str, parent: &str, skip: bool) -> Result<Option<String>, String> {
    let mut files = read_zip(zip_path)?;
    if !files.contains_key("meta.json") {
        // Accept one wrapper folder, never guess which of several projects to import.
        let roots: HashSet<_> = files.keys().filter_map(|p| p.split_once('/').map(|v| v.0.to_string())).collect();
        if roots.len() == 1 && files.keys().all(|p| p.contains('/')) {
            let root = roots.iter().next().unwrap();
            let prefix = format!("{root}/");
            files = files.into_iter().map(|(p, b)| (p[prefix.len()..].to_string(), b)).collect();
        }
    }
    let meta = validate_project_files(&files)?;
    files.insert("meta.json".into(), serde_json::to_vec_pretty(&meta).map_err(|e| e.to_string())?);
    let dir = category_dir(base, parent)?;
    let name = Path::new(zip_path).file_stem().and_then(|s| s.to_str()).ok_or("invalid ZIP name")?;
    let Some(name) = unique_name(&dir, name, skip)? else { return Ok(None); };
    let rel = join_rel_path(parent, &name)?;
    let target = safe_path(base, &rel)?;
    let stage = tempfile::tempdir_in(&dir).map_err(|e| e.to_string())?;
    write_files(&stage.path().to_path_buf(), &files)?;
    fs::rename(stage.path(), &target).map_err(|e| e.to_string())?;
    Ok(Some(rel))
}

#[tauri::command]
pub fn import_project_zip(app: AppHandle, zip_path: String, target_folder: String, skip_existing: bool) -> Result<Option<String>, String> {
    import_project_into(&sketches_dir(&app), &zip_path, &target_folder, skip_existing)
}

#[tauri::command]
pub fn import_js_project(app: AppHandle, path: String, target_folder: String) -> Result<String, String> {
    let base = sketches_dir(&app);
    let dir = category_dir(&base, &target_folder)?;
    let original = Path::new(&path).file_stem().and_then(|s| s.to_str()).ok_or("invalid filename")?;
    let name = unique_name(&dir, original, false)?.ok_or("invalid filename")?;
    let rel = join_rel_path(&target_folder, &name)?;
    let target = safe_path(&base, &rel)?;
    let code = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let stage = tempfile::tempdir_in(&dir).map_err(|e| e.to_string())?;
    fs::write(stage.path().join("sketch.js"), code).map_err(|e| e.to_string())?;
    write_meta(&stage.path().to_path_buf(), &SketchMeta { files: vec!["sketch.js".into()], ..SketchMeta::default() })?;
    fs::rename(stage.path(), target).map_err(|e| e.to_string())?;
    Ok(rel)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSave {
    original_name: Option<String>,
    name: String,
    files: Vec<SketchFile>,
    notes: String,
    libraries: Vec<String>,
    p5_version: String,
}

fn save_into(base: &PathBuf, project: ProjectSave) -> Result<(), String> {
    let target = safe_path(base, &project.name)?;
    let parent_rel = project.name.rsplit_once('/').map(|v| v.0).unwrap_or("");
    let parent = category_dir(base, parent_rel)?;
    let source = project.original_name.as_ref().map(|s| safe_path(base, s)).transpose()?;
    if target.exists() && source.as_ref() != Some(&target) { return Err("a project or folder with that name already exists".into()); }
    if let Some(src) = &source { if !is_sketch_dir(src) { return Err("original project no longer exists".into()); } }
    let stage = tempfile::tempdir_in(&parent).map_err(|e| e.to_string())?;
    let stage_path = stage.path().to_path_buf();
    if let Some(src) = &source {
        let mut files = BTreeMap::new();
        collect_files(src, "", &mut files)?;
        write_files(&stage_path, &files)?;
        let old_meta = read_meta_checked(src)?;
        for old in old_meta.files {
            if !project.files.iter().any(|f| f.name == old) {
                let path = safe_path(&stage_path, &old)?;
                if path.is_file() { fs::remove_file(path).map_err(|e| e.to_string())?; }
            }
        }
    }
    let mut names = HashSet::new();
    for file in &project.files {
        if file.name.contains('/') || !file.name.to_lowercase().ends_with(".js") || !names.insert(file.name.to_lowercase()) {
            return Err("invalid code file names".into());
        }
        fs::write(safe_path(&stage_path, &file.name)?, &file.code).map_err(|e| e.to_string())?;
    }
    if project.files.is_empty() { return Err("project needs at least one code file".into()); }
    if project.p5_version.trim().is_empty() { return Err("p5.js version cannot be empty".into()); }
    write_meta(&stage_path, &SketchMeta {
        files: project.files.iter().map(|f| f.name.clone()).collect(),
        notes: project.notes, libraries: project.libraries, p5_version: project.p5_version,
    })?;
    let backup = tempfile::tempdir_in(&parent).map_err(|e| e.to_string())?;
    let old = backup.path().join("original");
    if let Some(src) = &source { fs::rename(src, &old).map_err(|e| e.to_string())?; }
    if let Err(error) = fs::rename(stage.path(), &target) {
        if let Some(src) = &source {
            if let Err(rollback) = fs::rename(&old, src) {
                let kept = backup.keep();
                return Err(format!("save failed: {error}; rollback failed: {rollback}; original retained at {}", kept.display()));
            }
        }
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn save_project(app: AppHandle, project: ProjectSave) -> Result<(), String> { save_into(&sketches_dir(&app), project) }

#[derive(Serialize)]
pub struct AssetEntry { path: String, size: u64 }

#[tauri::command]
pub fn list_project_assets(app: AppHandle, name: String) -> Result<Vec<AssetEntry>, String> {
    let base = sketches_dir(&app);
    let dir = safe_path(&base, &name)?;
    let meta = read_meta(&dir);
    let mut files = BTreeMap::new();
    collect_files(&dir, "", &mut files)?;
    Ok(files.into_iter().filter(|(p, _)| !meta.files.contains(p) && !["meta.json", "thumbnail.png"].contains(&p.as_str()))
        .map(|(path, bytes)| AssetEntry { path, size: bytes.len() as u64 }).collect())
}

#[tauri::command]
pub fn add_project_assets(app: AppHandle, name: String, paths: Vec<String>, folder: String, overwrite: bool) -> Result<Vec<String>, String> {
    let base = sketches_dir(&app);
    let dir = safe_path(&base, &name)?;
    if !is_sketch_dir(&dir) { return Err("save the project first".into()); }
    let destination = if folder.is_empty() { dir.clone() } else { safe_path(&dir, &folder)? };
    let meta = read_meta(&dir);
    let stage = tempfile::tempdir_in(&dir).map_err(|e| e.to_string())?;
    let mut additions = Vec::new();
    for source in paths {
        let src = Path::new(&source);
        if !fs::symlink_metadata(src).map_err(|e| e.to_string())?.is_file() { return Err("only regular resource files are supported".into()); }
        let filename = src.file_name().and_then(|s| s.to_str()).ok_or("invalid filename")?;
        let mut candidate = filename.to_string();
        if !overwrite {
            candidate = unique_name(&destination, filename, false)?.ok_or("invalid filename")?;
            let mut suffix = 2;
            while destination.join(&candidate).exists() || additions.iter().any(|(rel, _, _): &(String, PathBuf, PathBuf)| rel.eq_ignore_ascii_case(&join_rel_path(&folder, &candidate).unwrap_or_default())) {
                let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or(filename);
                let ext = src.extension().and_then(|s| s.to_str()).map(|s| format!(".{s}")).unwrap_or_default();
                candidate = format!("{stem} ({suffix}){ext}"); suffix += 1;
                if destination.join(&candidate).exists() { continue; }
            }
        }
        let rel = join_rel_path(&folder, &candidate)?;
        if meta.files.iter().any(|p| p.eq_ignore_ascii_case(&rel)) || ["meta.json", "thumbnail.png", ".folder.json"].contains(&rel.to_lowercase().as_str()) {
            return Err("cannot replace project metadata or code through the resource panel".into());
        }
        let target = safe_path(&dir, &rel)?;
        let staged = stage.path().join(additions.len().to_string());
        fs::copy(src, &staged).map_err(|e| e.to_string())?;
        additions.push((rel, staged, target));
    }
    for (_, staged, target) in &additions {
        fs::create_dir_all(target.parent().ok_or("missing parent")?).map_err(|e| e.to_string())?;
        let temp = tempfile::NamedTempFile::new_in(target.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::copy(staged, temp.path()).map_err(|e| e.to_string())?;
        if overwrite { temp.persist(target).map_err(|e| e.to_string())?; }
        else { temp.persist_noclobber(target).map_err(|e| e.to_string())?; }
    }
    Ok(additions.into_iter().map(|a| a.0).collect())
}

#[tauri::command]
pub fn remove_project_asset(app: AppHandle, name: String, path: String) -> Result<(), String> {
    let dir = safe_path(&sketches_dir(&app), &name)?;
    let meta = read_meta(&dir);
    if meta.files.iter().any(|p| p.eq_ignore_ascii_case(&path)) || ["meta.json", "thumbnail.png", ".folder.json"].contains(&path.to_lowercase().as_str()) { return Err("cannot remove metadata or code as a resource".into()); }
    fs::remove_file(safe_path(&dir, &path)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_project(app: AppHandle, name: String, dest_path: String) -> Result<(), String> {
    let base = sketches_dir(&app);
    let files = project_archive(&base, &name)?;
    if Path::new(&dest_path).starts_with(&base) { return Err("export outside the sketch storage folder".into()); }
    write_zip(&dest_path, &files)
}

#[tauri::command]
pub fn export_folder(app: AppHandle, path: String, dest_path: String) -> Result<(), String> {
    let base = sketches_dir(&app);
    if Path::new(&dest_path).starts_with(&base) { return Err("export outside the sketch storage folder".into()); }
    write_zip(&dest_path, &folder_archive(&base, &path)?)
}

fn folder_archive(base: &PathBuf, path: &str) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let dir = if path.is_empty() { base.clone() } else { safe_path(&base, &path)? };
    let mut files = BTreeMap::new();
    collect_files(&dir, path, &mut files)?;
    // Resolve shared dependencies for each contained sketch into its own folder.
    let mut projects = Vec::new();
    collect_sketch_paths(&dir, "", &mut projects);
    for project in projects {
        let rel = if path.is_empty() { project.clone() } else { format!("{path}/{project}") };
        for (file, data) in project_archive(&base, &rel)? { files.insert(format!("{rel}/{file}"), data); }
    }
    Ok(files)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult { imported: Vec<String>, backup_path: String }

#[tauri::command]
pub fn restore_backup(app: AppHandle, zip_path: String) -> Result<RestoreResult, String> {
    let base = sketches_dir(&app);
    let backups = app.path().app_data_dir().map_err(|e| e.to_string())?.join("backups");
    restore_into(&base, &backups, &zip_path)
}

fn restore_into(base: &PathBuf, backups: &PathBuf, zip_path: &str) -> Result<RestoreResult, String> {
    let files = read_zip(zip_path)?;
    // Validate every destination before writing anything or making the backup.
    for path in files.keys() { safe_path(&base, path)?; }
    fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let backup = backups.join(format!("before-restore-{stamp}.zip"));
    let mut original = BTreeMap::new();
    collect_files(&base, "", &mut original)?;
    write_zip(backup.to_str().ok_or("invalid backup path")?, &original)?;
    let parent = base.parent().ok_or("missing data directory")?;
    let stage = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
    let staged = stage.path().join("sketches");
    fs::create_dir(&staged).map_err(|e| e.to_string())?;
    original.extend(files);
    write_files(&staged, &original)?;
    let previous = stage.path().join("previous");
    fs::rename(base, &previous).map_err(|e| e.to_string())?;
    if let Err(e) = fs::rename(&staged, base) {
        if fs::rename(&previous, base).is_err() {
            let retained = stage.keep();
            return Err(format!("restore failed: {e}; original retained at {}", retained.display()));
        }
        return Err(e.to_string());
    }
    let mut imported = Vec::new();
    collect_sketch_paths(&base, "", &mut imported);
    Ok(RestoreResult { imported, backup_path: backup.to_string_lossy().to_string() })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(base: &PathBuf, name: &str) {
        save_into(base, ProjectSave {
            original_name: None, name: name.into(),
            files: vec![SketchFile { name: "sketch.js".into(), code: "function setup() { createCanvas(80, 80); }".into() },
                SketchFile { name: "utils.js".into(), code: "const answer = 42;".into() }],
            notes: "测试作业".into(), libraries: vec![], p5_version: "1.11.13".into(),
        }).unwrap();
        fs::create_dir_all(base.join(name).join("assets")).unwrap();
        fs::write(base.join(name).join("assets/图片.png"), b"local image").unwrap();
    }

    #[test]
    fn category_export_preserves_target_hierarchy_and_excludes_other_classes() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("base"); fs::create_dir(&base).unwrap();
        seed(&base, "某班/第一次/ABC"); seed(&base, "另一班/第一次/DEF");
        let files = folder_archive(&base, "某班/第一次").unwrap();
        assert!(files.contains_key("某班/第一次/ABC/meta.json"));
        assert!(files.keys().all(|p| p.starts_with("某班/第一次/")));
        let archive = temp.path().join("class.zip"); write_zip(archive.to_str().unwrap(), &files).unwrap();
        let dest = temp.path().join("dest"); fs::create_dir(&dest).unwrap();
        restore_into(&dest, &temp.path().join("backups"), archive.to_str().unwrap()).unwrap();
        assert_eq!(read_meta(&dest.join("某班/第一次/ABC")).notes, "测试作业");
        assert!(!dest.join("另一班").exists());
    }

    #[test]
    fn corrupt_original_metadata_is_preserved_when_save_is_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("base"); fs::create_dir(&base).unwrap();
        seed(&base, "ABC");
        fs::write(base.join("ABC/meta.json"), b"broken metadata").unwrap();
        let old_code = fs::read(base.join("ABC/sketch.js")).unwrap();
        assert!(save_into(&base, ProjectSave { original_name: Some("ABC".into()), name: "ABC".into(),
            files: vec![SketchFile { name: "sketch.js".into(), code: "changed".into() }],
            notes: String::new(), libraries: vec![], p5_version: "1.11.13".into() }).is_err());
        assert_eq!(fs::read(base.join("ABC/meta.json")).unwrap(), b"broken metadata");
        assert_eq!(fs::read(base.join("ABC/sketch.js")).unwrap(), old_code);
    }

    #[test]
    fn project_roundtrip_bundles_assets_versions_and_preserves_collisions() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("source"); fs::create_dir(&base).unwrap();
        seed(&base, "班级/第一次/ABC");
        fs::create_dir_all(base.join("public/libraries")).unwrap();
        fs::write(base.join("public/shared.wav"), b"shared sound").unwrap();
        fs::write(base.join("public/libraries/custom.js"), b"var library = true;").unwrap();
        let mut meta = read_meta(&base.join("班级/第一次/ABC"));
        meta.libraries.push("libraries/custom.js".into());
        write_meta(&base.join("班级/第一次/ABC"), &meta).unwrap();
        let files = project_archive(&base, "班级/第一次/ABC").unwrap();
        assert_eq!(files["shared.wav"], b"shared sound");
        assert_eq!(files["libraries/custom.js"], b"var library = true;");
        let zip = temp.path().join("ABC.zip"); write_zip(zip.to_str().unwrap(), &files).unwrap();
        let dest = temp.path().join("destination"); fs::create_dir(&dest).unwrap();
        assert_eq!(import_project_into(&dest, zip.to_str().unwrap(), "班级/第一次", false).unwrap(), Some("班级/第一次/ABC".into()));
        let mut reloaded = BTreeMap::new(); collect_files(&dest.join("班级/第一次/ABC"), "", &mut reloaded).unwrap();
        assert_eq!(files, reloaded);
        assert_eq!(read_meta(&dest.join("班级/第一次/ABC")).p5_version, "1.11.13");
        assert_eq!(import_project_into(&dest, zip.to_str().unwrap(), "班级/第一次", false).unwrap(), Some("班级/第一次/ABC (2)".into()));
        assert_eq!(import_project_into(&dest, zip.to_str().unwrap(), "班级/第一次", true).unwrap(), None);
        assert_eq!(fs::read(dest.join("班级/第一次/ABC/assets/图片.png")).unwrap(), b"local image");
    }

    #[test]
    fn zip_validation_rejects_traversal_links_case_aliases_and_invalid_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("base"); fs::create_dir(&base).unwrap();
        for name in ["../escape.js", "/absolute.js", "folder/../../escape.js", "C:/escape.js", "CON.js", "alias.js ", " alias.js", "alias.js."] {
            let zip = temp.path().join("bad.zip");
            let files = BTreeMap::from([(name.into(), b"bad".to_vec())]);
            write_zip(zip.to_str().unwrap(), &files).unwrap();
            assert!(import_project_into(&base, zip.to_str().unwrap(), "class", false).is_err());
            assert_eq!(fs::read_dir(&base).unwrap().count(), 0);
        }
        let zip = temp.path().join("case.zip");
        write_zip(zip.to_str().unwrap(), &BTreeMap::from([("Image.png".into(), vec![1]), ("image.png".into(), vec![2])])).unwrap();
        assert!(read_zip(zip.to_str().unwrap()).is_err());
        let zip = temp.path().join("html.zip");
        write_zip(zip.to_str().unwrap(), &BTreeMap::from([("index.html".into(), b"<html></html>".to_vec())])).unwrap();
        assert!(import_project_into(&base, zip.to_str().unwrap(), "class", false).unwrap_err().contains("not a P5JS Studio"));
        let zip = temp.path().join("link.zip");
        let mut writer = zip::ZipWriter::new(fs::File::create(&zip).unwrap());
        writer.add_symlink("link", "../outside", zip::write::SimpleFileOptions::default()).unwrap();
        writer.finish().unwrap();
        assert!(read_zip(zip.to_str().unwrap()).is_err());
    }

    #[test]
    fn rename_save_keeps_resources_and_failed_save_keeps_original() {
        let temp = tempfile::tempdir().unwrap(); let base = temp.path().to_path_buf();
        seed(&base, "class/ABC"); seed(&base, "class/DEF");
        let request = |name: &str| ProjectSave {
            original_name: Some("class/ABC".into()), name: name.into(),
            files: vec![SketchFile { name: "sketch.js".into(), code: "updated".into() }],
            notes: "new note".into(), libraries: vec![], p5_version: "2.3.4".into(),
        };
        assert!(save_into(&base, request("class/DEF")).is_err());
        assert!(fs::read_to_string(base.join("class/ABC/sketch.js")).unwrap().contains("createCanvas"));
        assert!(save_into(&base, request("class/../invalid")).is_err());
        save_into(&base, request("class/改名")).unwrap();
        assert!(!base.join("class/ABC").exists());
        assert_eq!(fs::read(base.join("class/改名/assets/图片.png")).unwrap(), b"local image");
        assert!(!base.join("class/改名/utils.js").exists());
        assert_eq!(read_meta(&base.join("class/改名")).p5_version, "2.3.4");
    }

    #[test]
    fn backup_restore_keeps_unmatched_files_and_retains_pre_restore_archive() {
        let temp = tempfile::tempdir().unwrap(); let base = temp.path().join("sketches");
        fs::create_dir(&base).unwrap(); seed(&base, "class/ABC");
        let zip = temp.path().join("incoming.zip");
        write_zip(zip.to_str().unwrap(), &BTreeMap::from([("class/ABC/sketch.js".into(), b"new code".to_vec())])).unwrap();
        let original = fs::read(base.join("class/ABC/sketch.js")).unwrap();
        let result = restore_into(&base, &temp.path().join("backups"), zip.to_str().unwrap()).unwrap();
        assert_eq!(fs::read(base.join("class/ABC/sketch.js")).unwrap(), b"new code");
        assert_eq!(fs::read(base.join("class/ABC/assets/图片.png")).unwrap(), b"local image");
        assert_eq!(read_zip(&result.backup_path).unwrap()["class/ABC/sketch.js"], original);
    }

    #[test]
    fn missing_code_and_library_fail_before_import_and_one_wrapper_is_supported() {
        let temp = tempfile::tempdir().unwrap(); let base = temp.path().join("source"); fs::create_dir(&base).unwrap();
        seed(&base, "ABC"); let files = project_archive(&base, "ABC").unwrap();
        let wrapped = files.iter().map(|(p, b)| (format!("outer/{p}"), b.clone())).collect();
        let zip = temp.path().join("ABC.zip"); write_zip(zip.to_str().unwrap(), &wrapped).unwrap();
        let dest = temp.path().join("destination"); fs::create_dir(&dest).unwrap();
        assert!(import_project_into(&dest, zip.to_str().unwrap(), "", false).unwrap().is_some());
        let mut missing = files.clone(); missing.remove("utils.js");
        assert!(validate_project_files(&missing).is_err());
        let mut meta = read_meta(&base.join("ABC")); meta.libraries.push("missing.js".into());
        missing = files; missing.insert("meta.json".into(), serde_json::to_vec(&meta).unwrap());
        assert!(validate_project_files(&missing).is_err());
    }
}
