use std::fs;
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

fn sketch_dir(app: &AppHandle, name: &str) -> PathBuf {
    sketches_dir(app).join(name)
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
    let mut names: Vec<String> = fs::read_dir(&base)
        .map(|e| {
            e.filter_map(|f| f.ok())
                .filter(|f| f.path().is_dir())
                .filter_map(|f| f.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

#[tauri::command]
fn get_sketch(app: AppHandle, name: String) -> Result<SketchData, String> {
    let dir = sketch_dir(&app, &name);
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
    let dir = sketch_dir(&app, &name);
    let meta = read_meta(&dir);
    SketchSummary {
        notes: meta.notes,
        has_thumbnail: dir.join("thumbnail.png").exists(),
    }
}

#[tauri::command]
fn get_thumbnail(app: AppHandle, name: String) -> Option<String> {
    thumbnail_data_url(&sketch_dir(&app, &name))
}

#[tauri::command]
fn create_sketch(app: AppHandle, name: String) -> Result<(), String> {
    let dir = sketch_dir(&app, &name);
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
    let dir = sketch_dir(&app, &sketch_name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(&file_name), &code).map_err(|e| e.to_string())?;
    let mut meta = read_meta(&dir);
    if !meta.files.contains(&file_name) {
        meta.files.push(file_name);
    }
    write_meta(&dir, &meta)
}

#[tauri::command]
fn add_sketch_file(app: AppHandle, sketch_name: String, file_name: String) -> Result<(), String> {
    let dir = sketch_dir(&app, &sketch_name);
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
    let dir = sketch_dir(&app, &sketch_name);
    fs::remove_file(dir.join(&file_name)).map_err(|e| e.to_string())?;
    let mut meta = read_meta(&dir);
    meta.files.retain(|f| f != &file_name);
    write_meta(&dir, &meta)
}

#[tauri::command]
fn save_notes(app: AppHandle, sketch_name: String, notes: String) -> Result<(), String> {
    let dir = sketch_dir(&app, &sketch_name);
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
    let path = sketch_dir(&app, &sketch_name).join("thumbnail.png");
    fs::write(path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_sketch(app: AppHandle, name: String) -> Result<(), String> {
    fs::remove_dir_all(sketch_dir(&app, &name)).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_sketch(app: AppHandle, path: String, name: String) -> Result<(), String> {
    let code = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let dir = sketch_dir(&app, &name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("sketch.js"), &code).map_err(|e| e.to_string())?;
    let meta = SketchMeta {
        notes: String::new(),
        files: vec!["sketch.js".to_string()],
    };
    write_meta(&dir, &meta)
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

    for sketch in fs::read_dir(&base).map_err(|e| e.to_string())? {
        let sketch = sketch.map_err(|e| e.to_string())?;
        if !sketch.path().is_dir() {
            continue;
        }
        let sname = sketch.file_name().into_string().map_err(|_| "bad name")?;
        for f in fs::read_dir(sketch.path()).map_err(|e| e.to_string())? {
            let f = f.map_err(|e| e.to_string())?;
            let fname = f.file_name().into_string().map_err(|_| "bad name")?;
            let content = fs::read(f.path()).map_err(|e| e.to_string())?;
            zip.start_file(format!("{}/{}", sname, fname), options)
                .map_err(|e| e.to_string())?;
            zip.write_all(&content).map_err(|e| e.to_string())?;
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
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

        let parts: Vec<&str> = zip_name.splitn(2, '/').collect();
        if parts.len() == 2 && !parts[1].is_empty() {
            // new folder format: sketch_name/file
            let dir = base.join(parts[0]);
            fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let mut content = Vec::new();
            zf.read_to_end(&mut content).map_err(|e| e.to_string())?;
            fs::write(dir.join(parts[1]), content).map_err(|e| e.to_string())?;
            imported.insert(parts[0].to_string());
        } else if zip_name.ends_with(".js") && !zip_name.contains('/') {
            // old flat format: name.js
            let stem = zip_name.trim_end_matches(".js");
            let dir = base.join(stem);
            fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let mut code = String::new();
            zf.read_to_string(&mut code).map_err(|e| e.to_string())?;
            fs::write(dir.join("sketch.js"), &code).map_err(|e| e.to_string())?;
            if !dir.join("meta.json").exists() {
                let meta = SketchMeta { notes: String::new(), files: vec!["sketch.js".to_string()] };
                write_meta(&dir, &meta).ok();
            }
            imported.insert(stem.to_string());
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
            get_sketch,
            get_sketch_summary,
            get_thumbnail,
            create_sketch,
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
