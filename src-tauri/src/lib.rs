use std::fs;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Default, Clone)]
struct SketchMeta {
    #[serde(default)]
    notes: String,
    #[serde(default)]
    files: Vec<String>,
}

#[derive(Serialize, Clone)]
struct SketchFile {
    name: String,
    code: String,
}

#[derive(Serialize)]
struct SketchData {
    files: Vec<SketchFile>,
    notes: String,
    thumbnail: Option<String>, // base64 data URL
}

#[derive(Serialize)]
struct SketchSummary {
    notes: String,
    has_thumbnail: bool,
}

#[derive(Serialize)]
struct DirectoryListing {
    folders: Vec<String>,
    sketches: Vec<String>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn sketches_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("app data dir")
        .join("sketches");
    fs::create_dir_all(&dir).ok();
    dir
}

fn validate_path_segment(segment: &str) -> Result<String, String> {
    let trimmed = segment.trim();
    if trimmed.is_empty() {
        return Err("name cannot be empty".to_string());
    }
    if trimmed == "." || trimmed == ".." {
        return Err("invalid path segment".to_string());
    }
    if trimmed.chars().any(|c| matches!(c, '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')) {
        return Err("name contains invalid characters".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_rel_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim().trim_matches('/');
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    if path.contains('\\') || path.starts_with('/') {
        return Err("invalid relative path".to_string());
    }

    let segments: Result<Vec<String>, String> = trimmed
        .split('/')
        .map(validate_path_segment)
        .collect();
    segments.map(|s| s.join("/"))
}

fn join_rel_path(parent: &str, child: &str) -> Result<String, String> {
    let parent = normalize_rel_path(parent)?;
    let child = validate_path_segment(child)?;
    if parent.is_empty() {
        Ok(child)
    } else {
        Ok(format!("{}/{}", parent, child))
    }
}

fn relative_dir(base: &PathBuf, rel_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_rel_path(rel_path)?;
    let mut dir = base.clone();
    if !normalized.is_empty() {
        for segment in normalized.split('/') {
            dir.push(segment);
        }
    }
    Ok(dir)
}

fn sketch_dir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    relative_dir(&sketches_dir(app), name)
}

fn is_sketch_dir(dir: &PathBuf) -> bool {
    dir.join("meta.json").is_file()
}

fn is_public_root(name: &str, current_path: &str) -> bool {
    current_path.is_empty() && name == "public"
}

fn read_meta(dir: &PathBuf) -> SketchMeta {
    fs::read_to_string(dir.join("meta.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_meta(dir: &PathBuf, meta: &SketchMeta) -> Result<(), String> {
    let json = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    fs::write(dir.join("meta.json"), json).map_err(|e| e.to_string())
}

fn thumbnail_data_url(dir: &PathBuf) -> Option<String> {
    let bytes = fs::read(dir.join("thumbnail.png")).ok()?;
    Some(format!("data:image/png;base64,{}", STANDARD.encode(&bytes)))
}

fn asset_mime_type(path: &PathBuf) -> &'static str {
    let extension = path
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "json" => "application/json",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "tsv" => "text/tab-separated-values",
        "xml" => "application/xml",
        "obj" => "text/plain",
        "stl" => "model/stl",
        "vert" | "frag" | "glsl" => "text/plain",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "bin" => "application/octet-stream",
        _ => "application/octet-stream",
    }
}

fn should_skip_asset(path: &PathBuf) -> bool {
    let Some(file_name) = path.file_name().map(|name| name.to_string_lossy().to_lowercase()) else {
        return true;
    };
    file_name == "meta.json" || file_name == "thumbnail.png"
}

fn collect_sketch_assets(dir: &PathBuf, prefix: &str, assets: &mut HashMap<String, String>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let rel_path = if prefix.is_empty() {
            name
        } else {
            format!("{}/{}", prefix, name)
        };

        if path.is_dir() {
            collect_sketch_assets(&path, &rel_path, assets);
            continue;
        }

        if should_skip_asset(&path) {
            continue;
        }
        let mime = asset_mime_type(&path);
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };

        let data_url = format!("data:{};base64,{}", mime, STANDARD.encode(&bytes));
        assets.insert(rel_path.clone(), data_url.clone());
        assets.insert(format!("/{}", rel_path), data_url);
    }
}

/// 将旧版单 .js 文件自动迁移为文件夹格式
fn migrate_old_sketches(base: &PathBuf) {
    let entries = match fs::read_dir(base) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() && path.extension().map_or(false, |e| e == "js") {
            let stem = path.file_stem().unwrap().to_string_lossy().to_string();
            let folder = base.join(&stem);
            if folder.exists() {
                continue;
            }
            if let Ok(code) = fs::read_to_string(&path) {
                if fs::create_dir_all(&folder).is_ok() {
                    let _ = fs::write(folder.join("sketch.js"), &code);
                    let meta = SketchMeta {
                        notes: String::new(),
                        files: vec!["sketch.js".to_string()],
                    };
                    let _ = write_meta(&folder, &meta);
                    let _ = fs::remove_file(&path);
                }
            }
        }
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
fn list_sketches(app: AppHandle) -> Vec<String> {
    let base = sketches_dir(&app);
    migrate_old_sketches(&base);
    let mut names = Vec::new();
    collect_sketch_paths(&base, "", &mut names);
    names.sort();
    names
}

fn collect_sketch_paths(dir: &PathBuf, prefix: &str, sketches: &mut Vec<String>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if is_public_root(&name, prefix) {
            continue;
        }
        let rel_path = if prefix.is_empty() {
            name
        } else {
            format!("{}/{}", prefix, name)
        };
        if is_sketch_dir(&path) {
            sketches.push(rel_path);
        } else {
            collect_sketch_paths(&path, &rel_path, sketches);
        }
    }
}

fn collect_folder_paths(dir: &PathBuf, prefix: &str, folders: &mut Vec<String>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if is_public_root(&name, prefix) || is_sketch_dir(&path) {
            continue;
        }
        let rel_path = if prefix.is_empty() {
            name
        } else {
            format!("{}/{}", prefix, name)
        };
        folders.push(rel_path.clone());
        collect_folder_paths(&path, &rel_path, folders);
    }
}

#[tauri::command]
fn list_directory(app: AppHandle, path: String) -> Result<DirectoryListing, String> {
    let base = sketches_dir(&app);
    migrate_old_sketches(&base);
    let normalized = normalize_rel_path(&path)?;
    let dir = relative_dir(&base, &normalized)?;
    if is_sketch_dir(&dir) {
        return Err("cannot browse inside a sketch".to_string());
    }

    let mut folders = Vec::new();
    let mut sketches = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if is_public_root(&name, &normalized) {
            continue;
        }
        if is_sketch_dir(&path) {
            sketches.push(name);
        } else {
            folders.push(name);
        }
    }
    folders.sort();
    sketches.sort();
    Ok(DirectoryListing { folders, sketches })
}

#[tauri::command]
fn list_folders(app: AppHandle) -> Vec<String> {
    let base = sketches_dir(&app);
    let mut folders = vec![String::new()];
    collect_folder_paths(&base, "", &mut folders);
    folders.sort();
    folders
}

#[tauri::command]
fn get_sketch(app: AppHandle, name: String) -> Result<SketchData, String> {
    let dir = sketch_dir(&app, &name)?;
    let meta = read_meta(&dir);

    let file_names: Vec<String> = if !meta.files.is_empty() {
        meta.files.clone()
    } else {
        let mut v: Vec<String> = fs::read_dir(&dir)
            .map(|e| {
                e.filter_map(|f| f.ok())
                    .filter(|f| f.path().extension().map_or(false, |x| x == "js"))
                    .filter_map(|f| f.file_name().into_string().ok())
                    .collect()
            })
            .unwrap_or_default();
        v.sort();
        v
    };

    let files: Vec<SketchFile> = file_names
        .iter()
        .filter_map(|fname| {
            let code = fs::read_to_string(dir.join(fname)).ok()?;
            Some(SketchFile { name: fname.clone(), code })
        })
        .collect();

    Ok(SketchData {
        files,
        notes: meta.notes,
        thumbnail: thumbnail_data_url(&dir),
    })
}

#[tauri::command]
fn get_sketch_summary(app: AppHandle, name: String) -> SketchSummary {
    let dir = match sketch_dir(&app, &name) {
        Ok(dir) => dir,
        Err(_) => return SketchSummary { notes: String::new(), has_thumbnail: false },
    };
    let meta = read_meta(&dir);
    SketchSummary {
        notes: meta.notes,
        has_thumbnail: dir.join("thumbnail.png").exists(),
    }
}

#[tauri::command]
fn get_thumbnail(app: AppHandle, name: String) -> Option<String> {
    thumbnail_data_url(&sketch_dir(&app, &name).ok()?)
}

#[tauri::command]
fn get_sketch_assets(app: AppHandle, name: String) -> HashMap<String, String> {
    let base = sketches_dir(&app);
    let mut assets = HashMap::new();

    // Global resources can live in sketches/public.
    collect_sketch_assets(&base.join("public"), "", &mut assets);
    // Sketch-local resources live beside sketch.js and override global names.
    if let Ok(dir) = sketch_dir(&app, &name) {
        collect_sketch_assets(&dir, "", &mut assets);
    }

    assets
}

#[tauri::command]
fn create_sketch(app: AppHandle, name: String) -> Result<(), String> {
    let dir = sketch_dir(&app, &name)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if !dir.join("sketch.js").exists() {
        let default_code = "function setup() {\n  createCanvas(windowWidth, windowHeight);\n  background(30, 30, 60);\n}\n\nfunction draw() {\n  fill(100, 200, 255, 80);\n  noStroke();\n  ellipse(mouseX, mouseY, 60, 60);\n}\n\nfunction windowResized() {\n  resizeCanvas(windowWidth, windowHeight);\n}\n";
        fs::write(dir.join("sketch.js"), default_code).map_err(|e| e.to_string())?;
    }
    let mut meta = read_meta(&dir);
    if !meta.files.contains(&"sketch.js".to_string()) {
        meta.files.insert(0, "sketch.js".to_string());
    }
    write_meta(&dir, &meta)
}

#[tauri::command]
fn save_sketch_file(
    app: AppHandle,
    sketch_name: String,
    file_name: String,
    code: String,
) -> Result<(), String> {
    let dir = sketch_dir(&app, &sketch_name)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    validate_path_segment(&file_name)?;
    fs::write(dir.join(&file_name), &code).map_err(|e| e.to_string())?;
    let mut meta = read_meta(&dir);
    if !meta.files.contains(&file_name) {
        meta.files.push(file_name);
    }
    write_meta(&dir, &meta)
}

#[tauri::command]
fn add_sketch_file(app: AppHandle, sketch_name: String, file_name: String) -> Result<(), String> {
    validate_path_segment(&file_name)?;
    let dir = sketch_dir(&app, &sketch_name)?;
    let path = dir.join(&file_name);
    if path.exists() {
        return Err(format!("{} already exists", file_name));
    }
    fs::write(&path, format!("// {}\n", file_name)).map_err(|e| e.to_string())?;
    let mut meta = read_meta(&dir);
    if !meta.files.contains(&file_name) {
        meta.files.push(file_name);
    }
    write_meta(&dir, &meta)
}

#[tauri::command]
fn remove_sketch_file(
    app: AppHandle,
    sketch_name: String,
    file_name: String,
) -> Result<(), String> {
    validate_path_segment(&file_name)?;
    let dir = sketch_dir(&app, &sketch_name)?;
    fs::remove_file(dir.join(&file_name)).map_err(|e| e.to_string())?;
    let mut meta = read_meta(&dir);
    meta.files.retain(|f| f != &file_name);
    write_meta(&dir, &meta)
}

#[tauri::command]
fn save_notes(app: AppHandle, sketch_name: String, notes: String) -> Result<(), String> {
    let dir = sketch_dir(&app, &sketch_name)?;
    let mut meta = read_meta(&dir);
    meta.notes = notes;
    write_meta(&dir, &meta)
}

#[tauri::command]
fn save_thumbnail(app: AppHandle, sketch_name: String, data_url: String) -> Result<(), String> {
    let b64 = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or("invalid data URL")?;
    let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
    let path = sketch_dir(&app, &sketch_name)?.join("thumbnail.png");
    fs::write(path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_sketch(app: AppHandle, name: String) -> Result<(), String> {
    let dir = sketch_dir(&app, &name)?;
    if !is_sketch_dir(&dir) {
        return Err("not a sketch".to_string());
    }
    fs::remove_dir_all(dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_sketch(app: AppHandle, path: String, name: String) -> Result<(), String> {
    let code = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let dir = sketch_dir(&app, &name)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("sketch.js"), &code).map_err(|e| e.to_string())?;
    let meta = SketchMeta {
        notes: String::new(),
        files: vec!["sketch.js".to_string()],
    };
    write_meta(&dir, &meta)
}

#[tauri::command]
fn create_folder(app: AppHandle, parent_path: String, name: String) -> Result<String, String> {
    let base = sketches_dir(&app);
    let rel_path = join_rel_path(&parent_path, &name)?;
    let dir = relative_dir(&base, &rel_path)?;
    if dir.exists() {
        return Err(format!("{} already exists", name));
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(rel_path)
}

#[tauri::command]
fn rename_folder(app: AppHandle, path: String, new_name: String) -> Result<String, String> {
    let base = sketches_dir(&app);
    let old_rel = normalize_rel_path(&path)?;
    if old_rel.is_empty() {
        return Err("cannot rename root".to_string());
    }
    let mut parts: Vec<&str> = old_rel.split('/').collect();
    parts.pop();
    let parent = parts.join("/");
    let new_rel = join_rel_path(&parent, &new_name)?;
    let old_dir = relative_dir(&base, &old_rel)?;
    let new_dir = relative_dir(&base, &new_rel)?;
    if is_sketch_dir(&old_dir) {
        return Err("cannot rename a sketch with folder rename".to_string());
    }
    if new_dir.exists() {
        return Err(format!("{} already exists", new_name));
    }
    fs::rename(old_dir, new_dir).map_err(|e| e.to_string())?;
    Ok(new_rel)
}

#[tauri::command]
fn delete_folder(app: AppHandle, path: String) -> Result<(), String> {
    let base = sketches_dir(&app);
    let rel = normalize_rel_path(&path)?;
    if rel.is_empty() {
        return Err("cannot delete root".to_string());
    }
    let dir = relative_dir(&base, &rel)?;
    if is_sketch_dir(&dir) {
        return Err("cannot delete a sketch with folder delete".to_string());
    }
    let is_empty = fs::read_dir(&dir).map_err(|e| e.to_string())?.next().is_none();
    if !is_empty {
        return Err("folder is not empty".to_string());
    }
    fs::remove_dir(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_sketch(app: AppHandle, sketch_path: String, dest_folder: String) -> Result<String, String> {
    let base = sketches_dir(&app);
    let source_rel = normalize_rel_path(&sketch_path)?;
    if source_rel.is_empty() {
        return Err("invalid sketch path".to_string());
    }
    let source_dir = relative_dir(&base, &source_rel)?;
    if !is_sketch_dir(&source_dir) {
        return Err("not a sketch".to_string());
    }

    let dest_rel = normalize_rel_path(&dest_folder)?;
    let dest_dir = relative_dir(&base, &dest_rel)?;
    if !dest_dir.exists() {
        return Err("destination folder does not exist".to_string());
    }
    if is_sketch_dir(&dest_dir) {
        return Err("destination cannot be a sketch".to_string());
    }

    let sketch_name = source_rel
        .split('/')
        .last()
        .ok_or("invalid sketch path")?
        .to_string();
    let target_rel = if dest_rel.is_empty() {
        sketch_name
    } else {
        format!("{}/{}", dest_rel, sketch_name)
    };
    let target_dir = relative_dir(&base, &target_rel)?;
    if target_dir.exists() {
        return Err("a sketch or folder with that name already exists".to_string());
    }
    fs::rename(source_dir, target_dir).map_err(|e| e.to_string())?;
    Ok(target_rel)
}

#[tauri::command]
fn open_sketches_dir(app: AppHandle) -> Result<(), String> {
    let dir = sketches_dir(&app);
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&dir).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(&dir).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&dir).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn export_sketches(app: AppHandle, dest_path: String) -> Result<(), String> {
    let base = sketches_dir(&app);
    let file = fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();

    add_dir_to_zip(&mut zip, &base, "", options)?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn add_dir_to_zip(
    zip: &mut zip::ZipWriter<fs::File>,
    dir: &PathBuf,
    prefix: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().into_string().map_err(|_| "bad name")?;
        let rel_path = if prefix.is_empty() {
            name
        } else {
            format!("{}/{}", prefix, name)
        };
        let path = entry.path();
        if path.is_dir() {
            zip.add_directory(format!("{}/", rel_path), options)
                .map_err(|e| e.to_string())?;
            add_dir_to_zip(zip, &path, &rel_path, options)?;
        } else {
            let content = fs::read(path).map_err(|e| e.to_string())?;
            zip.start_file(rel_path, options).map_err(|e| e.to_string())?;
            zip.write_all(&content).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn import_sketches_zip(app: AppHandle, zip_path: String) -> Result<Vec<String>, String> {
    let base = sketches_dir(&app);
    let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut imported: std::collections::HashSet<String> = Default::default();

    for i in 0..archive.len() {
        let mut zf = archive.by_index(i).map_err(|e| e.to_string())?;
        let zip_name = zf.name().to_string();

        if zf.is_dir() {
            let rel_dir = normalize_rel_path(zip_name.trim_end_matches('/'))?;
            fs::create_dir_all(relative_dir(&base, &rel_dir)?).map_err(|e| e.to_string())?;
            continue;
        }

        let rel_file = normalize_rel_path(&zip_name)?;
        if rel_file.ends_with(".js") && !rel_file.contains('/') {
            // old flat format: name.js
            let stem = rel_file.trim_end_matches(".js");
            let dir = relative_dir(&base, stem)?;
            fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let mut code = String::new();
            zf.read_to_string(&mut code).map_err(|e| e.to_string())?;
            fs::write(dir.join("sketch.js"), &code).map_err(|e| e.to_string())?;
            if !dir.join("meta.json").exists() {
                let meta = SketchMeta { notes: String::new(), files: vec!["sketch.js".to_string()] };
                write_meta(&dir, &meta).ok();
            }
            imported.insert(stem.to_string());
        } else {
            let path = relative_dir(&base, &rel_file)?;
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut content = Vec::new();
            zf.read_to_end(&mut content).map_err(|e| e.to_string())?;
            fs::write(&path, content).map_err(|e| e.to_string())?;
            if rel_file.ends_with("/meta.json") {
                if let Some(sketch_path) = rel_file.strip_suffix("/meta.json") {
                    imported.insert(sketch_path.to_string());
                }
            }
        }
    }

    let mut result: Vec<String> = imported.into_iter().collect();
    result.sort();
    Ok(result)
}

// ── App entry ─────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_sketches,
            list_directory,
            list_folders,
            get_sketch,
            get_sketch_summary,
            get_thumbnail,
            get_sketch_assets,
            create_sketch,
            create_folder,
            rename_folder,
            delete_folder,
            move_sketch,
            save_sketch_file,
            add_sketch_file,
            remove_sketch_file,
            save_notes,
            save_thumbnail,
            delete_sketch,
            import_sketch,
            open_sketches_dir,
            export_sketches,
            import_sketches_zip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
