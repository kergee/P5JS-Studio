use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn sketches_dir(app: &AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir");
    let sketches = data_dir.join("sketches");
    fs::create_dir_all(&sketches).ok();
    sketches
}

#[tauri::command]
fn list_sketches(app: AppHandle) -> Vec<String> {
    let dir = sketches_dir(&app);
    fs::read_dir(dir)
        .map(|entries| {
            let mut names: Vec<String> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().map_or(false, |ext| ext == "js"))
                .filter_map(|e| e.file_name().into_string().ok())
                .map(|name| name.trim_end_matches(".js").to_string())
                .collect();
            names.sort();
            names
        })
        .unwrap_or_default()
}

#[tauri::command]
fn save_sketch(app: AppHandle, name: String, code: String) -> Result<(), String> {
    let path = sketches_dir(&app).join(format!("{}.js", name));
    fs::write(path, code).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_sketch(app: AppHandle, name: String) -> Result<String, String> {
    let path = sketches_dir(&app).join(format!("{}.js", name));
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_sketch(app: AppHandle, name: String) -> Result<(), String> {
    let path = sketches_dir(&app).join(format!("{}.js", name));
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_sketch(app: AppHandle, path: String, name: String) -> Result<(), String> {
    let code = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let dest = sketches_dir(&app).join(format!("{}.js", name));
    fs::write(dest, code).map_err(|e| e.to_string())
}

/// 在系统文件管理器中打开 sketches 目录
#[tauri::command]
fn open_sketches_dir(app: AppHandle) -> Result<(), String> {
    let dir = sketches_dir(&app);
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 将所有草图打包成 zip 导出到指定路径
#[tauri::command]
fn export_sketches(app: AppHandle, dest_path: String) -> Result<(), String> {
    let dir = sketches_dir(&app);
    let file = fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();

    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().extension().map_or(false, |ext| ext == "js") {
            let filename = entry
                .file_name()
                .into_string()
                .map_err(|_| "invalid filename".to_string())?;
            let code = fs::read_to_string(entry.path()).map_err(|e| e.to_string())?;
            zip.start_file(&filename, options).map_err(|e| e.to_string())?;
            zip.write_all(code.as_bytes()).map_err(|e| e.to_string())?;
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// 从 zip 文件导入草图，返回成功导入的草图名列表
#[tauri::command]
fn import_sketches_zip(app: AppHandle, zip_path: String) -> Result<Vec<String>, String> {
    let dir = sketches_dir(&app);
    let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut imported = Vec::new();

    for i in 0..archive.len() {
        let mut zf = archive.by_index(i).map_err(|e| e.to_string())?;
        let raw_name = zf.name().to_string();
        // 只处理根目录下的 .js 文件，忽略子目录和其他格式
        let filename = std::path::Path::new(&raw_name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if filename.ends_with(".js") && !filename.is_empty() {
            let mut code = String::new();
            zf.read_to_string(&mut code).map_err(|e| e.to_string())?;
            fs::write(dir.join(&filename), &code).map_err(|e| e.to_string())?;
            imported.push(filename.trim_end_matches(".js").to_string());
        }
    }
    imported.sort();
    Ok(imported)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_sketches,
            save_sketch,
            read_sketch,
            delete_sketch,
            import_sketch,
            open_sketches_dir,
            export_sketches,
            import_sketches_zip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
