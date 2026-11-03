//! Single-file HTML shares carry an inert, versioned project ZIP.
use super::*;
use std::io::Cursor;

const HTML_LIMIT: u64 = 128 * 1024 * 1024;
const PROJECT_LIMIT: u64 = 64 * 1024 * 1024;
const HTML_LIMIT_ERROR: &str = "HTML exceeds 128 MiB. Use Project ZIP instead.";
const PROJECT_LIMIT_ERROR: &str = "HTML project exceeds 64 MiB unpacked. Use Project ZIP instead.";
const MARKER: &str = "\n<!-- P5JS-STUDIO-PROJECT:";
const VERSION: &str = "1";
const END: &str = "\n-->\n";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HtmlProject {
    files: Vec<SketchFile>,
    libraries: Vec<String>,
    p5_version: String,
    assets: BTreeMap<String, String>,
    payload: String,
}

fn read_limited(path: &Path, limit: u64, limit_error: &str) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > limit {
        return Err(limit_error.into());
    }
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err(limit_error.into());
    }
    Ok(bytes)
}

fn collect_share_files(
    dir: &Path,
    prefix: &str,
    files: &mut BTreeMap<String, Vec<u8>>,
    remaining: &mut u64,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "Invalid resource name")?;
        if prefix.is_empty()
            && ["meta.json", ".folder.json", "thumbnail.png"]
                .contains(&name.to_lowercase().as_str())
        {
            continue;
        }
        let path = safe_path(&dir.to_path_buf(), &name)?;
        let rel = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_dir() {
            collect_share_files(&path, &rel, files, remaining)?;
        } else if kind.is_file() {
            add_share_file(&path, rel, files, remaining)?;
        } else {
            return Err(format!("Unsupported resource: {rel}"));
        }
    }
    Ok(())
}

fn add_share_file(
    path: &Path,
    rel: String,
    files: &mut BTreeMap<String, Vec<u8>>,
    remaining: &mut u64,
) -> Result<(), String> {
    if files.len() >= MAX_ENTRIES - 1 {
        return Err("HTML project has too many files. Use Project ZIP instead.".into());
    }
    let bytes = read_limited(path, *remaining, PROJECT_LIMIT_ERROR)?;
    *remaining -= bytes.len() as u64;
    files.insert(rel, bytes);
    Ok(())
}

pub(super) fn validate_share_paths(files: &BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    let mut paths = HashMap::new();
    for path in files.keys() {
        let mut prefix = path.as_str();
        let mut is_file = true;
        loop {
            if let Some(previous) = paths.insert(prefix.to_lowercase(), (prefix, is_file)) {
                if previous != (prefix, is_file) {
                    return Err(format!("Conflicting resource paths: {path}"));
                }
            }
            let Some((parent, _)) = prefix.rsplit_once('/') else {
                break;
            };
            prefix = parent;
            is_file = false;
        }
    }
    Ok(())
}

fn project_for_html(base: &PathBuf, name: &str) -> Result<HtmlProject, String> {
    let dir = safe_path(base, name)?;
    let meta: SketchMeta = serde_json::from_slice(&read_limited(
        &safe_path(&dir, "meta.json")?,
        PROJECT_LIMIT,
        PROJECT_LIMIT_ERROR,
    )?)
    .map_err(|e| format!("Invalid project metadata: {e}"))?;

    let mut files = BTreeMap::new();
    let mut remaining = PROJECT_LIMIT;
    collect_share_files(&dir, "", &mut files, &mut remaining)?;

    // A share can copy a declared shared script, but never sweeps the shared library.
    let mut dependency_errors = Vec::new();
    for library in &meta.libraries {
        if library.starts_with("data:") {
            continue;
        }
        let rel = library.trim_start_matches("./");
        let public_path = safe_path(base, &format!("public/{rel}"));
        if safe_path(&dir, rel).is_err() || rel.contains(':') {
            dependency_errors.push(format!("{library} (use a local script)"));
        } else if let Some(bytes) = files.get(rel) {
            if std::str::from_utf8(bytes).is_err() {
                dependency_errors.push(format!("{library} (invalid UTF-8)"));
            }
        } else if let Some(path) = public_path.ok().filter(|path| path.is_file()) {
            add_share_file(&path, rel.to_string(), &mut files, &mut remaining)?;
            if std::str::from_utf8(&files[rel]).is_err() {
                dependency_errors.push(format!("{library} (invalid UTF-8)"));
            }
        } else {
            dependency_errors.push(format!("{library} (missing local script)"));
        }
    }
    if !dependency_errors.is_empty() {
        return Err(format!(
            "Project dependencies:\n{}",
            dependency_errors.join("\n")
        ));
    }

    let metadata = serde_json::to_vec(&serde_json::json!({
        "files": meta.files,
        "libraries": meta.libraries,
        "p5Version": meta.p5_version,
    }))
    .map_err(|e| e.to_string())?;
    if metadata.len() as u64 > remaining {
        return Err(PROJECT_LIMIT_ERROR.into());
    }
    files.insert("meta.json".into(), metadata);
    validate_share_paths(&files)?;
    validate_project_files(&files)?;

    let payload = STANDARD.encode(write_zip_entries(Cursor::new(Vec::new()), &files)?.into_inner());
    let mut sources = Vec::with_capacity(meta.files.len());
    for name in &meta.files {
        let code = std::str::from_utf8(files.get(name).ok_or("Missing code file")?)
            .map_err(|e| e.to_string())?
            .to_owned();
        sources.push(SketchFile {
            name: name.clone(),
            code,
        });
    }
    files.remove("meta.json");
    let assets = files
        .into_iter()
        .map(|(path, bytes)| {
            let mime = asset_mime_type(&PathBuf::from(&path));
            (
                path,
                format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
            )
        })
        .collect();
    Ok(HtmlProject {
        files: sources,
        libraries: meta.libraries,
        p5_version: meta.p5_version,
        assets,
        payload,
    })
}

fn write_html(base: &Path, destination: &Path, page: &str, payload: &str) -> Result<(), String> {
    let parent = destination.parent().ok_or("Missing export directory")?;
    let parent = parent.canonicalize().map_err(|e| e.to_string())?;
    if parent.starts_with(base.canonicalize().map_err(|e| e.to_string())?) {
        return Err("Export outside the sketch storage folder".into());
    }
    if !is_html(destination) {
        return Err("Choose an .html file".into());
    }
    let header = format!("{MARKER}{VERSION}\n");
    if (page.len() + header.len() + payload.len() + END.len()) as u64 > HTML_LIMIT {
        return Err(HTML_LIMIT_ERROR.into());
    }
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    for part in [page, &header, payload, END] {
        temp.write_all(part.as_bytes()).map_err(|e| e.to_string())?;
    }
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(destination).map_err(|e| e.to_string())?;
    Ok(())
}

fn is_html(path: &Path) -> bool {
    path.extension()
        .and_then(|v| v.to_str())
        .is_some_and(|v| v.eq_ignore_ascii_case("html"))
}

fn import_html_into(base: &PathBuf, source: &Path, parent: &str) -> Result<String, String> {
    if !is_html(source) {
        return Err("Choose a P5JS Studio .html file".into());
    }
    let html = String::from_utf8(read_limited(source, HTML_LIMIT, HTML_LIMIT_ERROR)?)
        .map_err(|_| "Damaged P5JS Studio HTML: expected UTF-8")?;
    let (page, marker) = html
        .rsplit_once(MARKER)
        .ok_or("This page has no P5JS Studio project data")?;
    let damaged = "Damaged P5JS Studio HTML project data";
    let (version, payload) = marker.split_once('\n').ok_or(damaged)?;
    if version.trim_end() != VERSION {
        return Err(format!(
            "Unsupported P5JS Studio HTML format version: {}",
            version.trim_end()
        ));
    }
    if page.contains(MARKER) {
        return Err(damaged.into());
    }
    let payload = payload
        .trim_end()
        .strip_suffix("-->")
        .ok_or(damaged)?
        .trim();
    let bytes = STANDARD.decode(payload).map_err(|_| damaged)?;
    drop(html);

    let mut files = read_zip_entries(Cursor::new(bytes), PROJECT_LIMIT, PROJECT_LIMIT_ERROR)
        .map_err(|e| {
            if e == PROJECT_LIMIT_ERROR {
                e
            } else {
                format!("{damaged}: {e}")
            }
        })?;
    validate_share_paths(&files).map_err(|e| format!("{damaged}: {e}"))?;
    let mut meta = validate_project_files(&files).map_err(|e| format!("{damaged}: {e}"))?;
    meta.notes.clear();
    meta.rating = 0;
    meta.favorite = false;
    files.retain(|path, _| {
        !["thumbnail.png", ".folder.json"].contains(&path.to_lowercase().as_str())
    });
    files.insert(
        "meta.json".into(),
        serde_json::to_vec(&meta).map_err(|e| e.to_string())?,
    );
    let name = source
        .file_stem()
        .and_then(|v| v.to_str())
        .ok_or("Invalid HTML filename")?;
    install_project_files(base, &files, parent, name, false)?
        .ok_or("Could not create HTML project".into())
}

#[tauri::command]
pub async fn prepare_html_export(app: AppHandle, name: String) -> Result<HtmlProject, String> {
    tauri::async_runtime::spawn_blocking(move || project_for_html(&sketches_dir(&app), &name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn write_project_html(
    app: AppHandle,
    dest_path: String,
    page: String,
    payload: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        write_html(&sketches_dir(&app), Path::new(&dest_path), &page, &payload)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn import_project_html(
    app: AppHandle,
    html_path: String,
    target_folder: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        import_html_into(&sketches_dir(&app), Path::new(&html_path), &target_folder)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(base: &PathBuf) -> PathBuf {
        let dir = base.join("Class/作品");
        fs::create_dir_all(dir.join("assets")).unwrap();
        fs::create_dir_all(base.join("public/lib")).unwrap();
        fs::write(
            dir.join("sketch.js"),
            "function setup() { createCanvas(20, 30); }",
        )
        .unwrap();
        fs::write(
            dir.join("helper.js"),
            "// 中文 </script>\r\nconst helper = 4;\n",
        )
        .unwrap();
        fs::write(dir.join("assets/config.json"), br#"{"color":"red"}"#).unwrap();
        fs::write(dir.join("thumbnail.png"), b"private thumbnail").unwrap();
        fs::write(base.join("public/lib/shared.js"), b"const library = 8;").unwrap();
        fs::write(base.join("public/unrelated.txt"), b"private shared file").unwrap();
        write_meta(
            &dir,
            &SketchMeta {
                files: vec!["helper.js".into(), "sketch.js".into()],
                libraries: vec!["lib/shared.js".into()],
                p5_version: "2.3.4".into(),
                notes: "private notes".into(),
                rating: 5,
                favorite: true,
            },
        )
        .unwrap();
        dir
    }

    #[test]
    fn html_roundtrip_preserves_order_version_and_resources_without_private_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("sketches");
        let original = fixture(&base);
        let project = project_for_html(&base, "Class/作品").unwrap();
        assert_eq!(project.p5_version, "2.3.4");
        assert_eq!(project.files[0].name, "helper.js");
        assert_eq!(project.files[1].name, "sketch.js");
        assert!(project.assets.contains_key("helper.js"));
        assert!(project.assets.contains_key("lib/shared.js"));
        assert!(!project.assets.contains_key("unrelated.txt"));
        assert!(!project.assets.contains_key("thumbnail.png"));

        let destination = temp.path().join("作品.html");
        write_html(
            &base,
            &destination,
            "<script>throw Error('do not execute on import');</script>",
            &project.payload,
        )
        .unwrap();
        assert_eq!(
            import_html_into(&base, &destination, "Class").unwrap(),
            "Class/作品 (2)"
        );
        let imported = base.join("Class/作品 (2)");
        let meta = read_meta_checked(&imported).unwrap();
        assert_eq!(meta.p5_version, "2.3.4");
        assert_eq!(meta.files, ["helper.js", "sketch.js"]);
        assert_eq!(meta.libraries, ["lib/shared.js"]);
        assert!(meta.notes.is_empty() && meta.rating == 0 && !meta.favorite);
        for file in ["sketch.js", "helper.js", "assets/config.json"] {
            assert_eq!(
                fs::read(original.join(file)).unwrap(),
                fs::read(imported.join(file)).unwrap()
            );
        }
        assert_eq!(
            fs::read(imported.join("lib/shared.js")).unwrap(),
            b"const library = 8;"
        );
        assert!(!imported.join("thumbnail.png").exists());
        assert_eq!(read_meta_checked(&original).unwrap().rating, 5);
    }

    #[test]
    fn html_import_rejects_invalid_documents_before_installing() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("sketches");
        fs::create_dir(&base).unwrap();
        let source = temp.path().join("incoming.html");
        for (document, error) in [
            (
                "<html><script>void 0</script></html>",
                "no P5JS Studio project data",
            ),
            ("\n<!-- P5JS-STUDIO-PROJECT:99\nAAAA\n-->", "Unsupported"),
            ("\n<!-- P5JS-STUDIO-PROJECT:1\n%%%\n-->", "Damaged"),
            ("\n<!-- P5JS-STUDIO-PROJECT:1\nAAAA", "Damaged"),
        ] {
            fs::write(&source, document).unwrap();
            assert!(import_html_into(&base, &source, "Class")
                .unwrap_err()
                .contains(error));
        }
        let archive = BTreeMap::from([("../escape.js".into(), b"void 0".to_vec())]);
        let bytes = write_zip_entries(Cursor::new(Vec::new()), &archive)
            .unwrap()
            .into_inner();
        write_html(&base, &source, "<html></html>", &STANDARD.encode(bytes)).unwrap();
        assert!(import_html_into(&base, &source, "Class")
            .unwrap_err()
            .contains("Damaged"));
        let conflicting = BTreeMap::from([
            ("assets".into(), Vec::new()),
            ("assets/image.png".into(), Vec::new()),
        ]);
        let bytes = write_zip_entries(Cursor::new(Vec::new()), &conflicting)
            .unwrap()
            .into_inner();
        write_html(&base, &source, "<html></html>", &STANDARD.encode(bytes)).unwrap();
        assert!(import_html_into(&base, &source, "Class")
            .unwrap_err()
            .contains("Conflicting resource paths"));
        fs::File::create(&source)
            .unwrap()
            .set_len(HTML_LIMIT + 1)
            .unwrap();
        assert_eq!(
            import_html_into(&base, &source, "Class").unwrap_err(),
            HTML_LIMIT_ERROR
        );
        assert_eq!(fs::read_dir(&base).unwrap().count(), 0);
        assert!(!temp.path().join("escape.js").exists());
    }

    #[test]
    fn html_export_checks_dependencies_and_size_before_writing() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("sketches");
        let dir = fixture(&base);
        let mut meta = read_meta_checked(&dir).unwrap();
        meta.libraries = vec![
            "https://example.invalid/library.js".into(),
            "missing.js".into(),
        ];
        write_meta(&dir, &meta).unwrap();
        let error = project_for_html(&base, "Class/作品").err().unwrap();
        assert!(
            error.contains("https://example.invalid/library.js") && error.contains("missing.js")
        );
        fs::File::create(dir.join("large.bin"))
            .unwrap()
            .set_len(PROJECT_LIMIT + 1)
            .unwrap();
        assert_eq!(
            project_for_html(&base, "Class/作品").err().unwrap(),
            PROJECT_LIMIT_ERROR
        );
        assert!(write_html(&base, &dir.join("share.html"), "", "").is_err());
    }
}
