use std::fs;
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
                .filter(|e| {
                    e.path()
                        .extension()
                        .map_or(false, |ext| ext == "js")
                })
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

/// Import a sketch from an arbitrary file path (e.g. from file dialog or drag-drop)
#[tauri::command]
fn import_sketch(app: AppHandle, path: String, name: String) -> Result<(), String> {
    let code = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let dest = sketches_dir(&app).join(format!("{}.js", name));
    fs::write(dest, code).map_err(|e| e.to_string())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
