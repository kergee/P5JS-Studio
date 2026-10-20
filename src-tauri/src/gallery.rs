//! Lightweight gallery index and optional project review annotations.
use super::*;

#[derive(Serialize)]
pub struct SketchSummary {
    path: String,
    notes: String,
    rating: u8,
    favorite: bool,
}

fn summaries(base: &PathBuf) -> Vec<SketchSummary> {
    let mut paths = Vec::new();
    collect_sketch_paths(base, "", &mut paths);
    paths.sort();
    paths.into_iter().map(|path| {
        let meta = read_meta(&base.join(&path));
        SketchSummary { path, notes: meta.notes, rating: meta.rating, favorite: meta.favorite }
    }).collect()
}

#[tauri::command]
pub fn list_sketch_summaries(app: AppHandle) -> Vec<SketchSummary> {
    let base = sketches_dir(&app);
    migrate_old_sketches(&base);
    summaries(&base)
}

#[tauri::command]
pub fn get_sketch_overviews(app: AppHandle, names: Vec<String>) -> Result<HashMap<String, SketchOverview>, String> {
    let mut result = HashMap::new();
    for name in names {
        let dir = sketch_dir(&app, &name)?;
        if !is_sketch_dir(&dir) { continue; }
        let meta = read_meta(&dir);
        result.insert(name, SketchOverview { notes: meta.notes, thumbnail: thumbnail_data_url(&dir) });
    }
    Ok(result)
}

fn update_review(base: &PathBuf, name: &str, rating: Option<u8>, favorite: Option<bool>) -> Result<(), String> {
    if rating.is_some_and(|value| value > 5) { return Err("rating must be between 0 (unrated) and 5".into()); }
    let normalized = normalize_rel_path(name)?;
    if normalized.is_empty() || normalized.split('/').next() == Some("public") { return Err("not a project".into()); }
    let dir = relative_dir(base, &normalized)?;
    let mut meta = read_meta_checked(&dir)?;
    if let Some(value) = rating { meta.rating = value; }
    if let Some(value) = favorite { meta.favorite = value; }
    // Persist atomically; a failed write must leave the existing metadata intact.
    let mut temp = tempfile::NamedTempFile::new_in(&dir).map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(&mut temp, &meta).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(dir.join("meta.json")).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_project_review(app: AppHandle, name: String, rating: Option<u8>, favorite: Option<bool>) -> Result<(), String> {
    update_review(&sketches_dir(&app), &name, rating, favorite)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optional_review_is_independent_and_preserves_project_data() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().to_path_buf();
        let dir = base.join("班级/ABC"); fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("meta.json"), r#"{"notes":"说明","files":["sketch.js"],"libraries":["lib.js"],"p5Version":"2.3.4"}"#).unwrap();
        let original = read_meta_checked(&dir).unwrap();
        assert_eq!(original.rating, 0); assert!(!original.favorite);
        for value in 1..=5 {
            update_review(&base, "班级/ABC", Some(value), None).unwrap();
            let meta = read_meta_checked(&dir).unwrap();
            assert_eq!(meta.rating, value); assert!(!meta.favorite);
        }
        update_review(&base, "班级/ABC", None, Some(true)).unwrap();
        update_review(&base, "班级/ABC", Some(0), None).unwrap();
        let meta = read_meta_checked(&dir).unwrap();
        assert_eq!(meta.rating, 0); assert!(meta.favorite);
        assert_eq!(meta.notes, original.notes); assert_eq!(meta.files, original.files);
        assert_eq!(meta.libraries, original.libraries); assert_eq!(meta.p5_version, original.p5_version);
        let snapshot = fs::read(dir.join("meta.json")).unwrap();
        assert!(update_review(&base, "班级/ABC", Some(6), Some(false)).is_err());
        assert_eq!(fs::read(dir.join("meta.json")).unwrap(), snapshot);
        assert!(update_review(&base, "../outside", Some(3), None).is_err());
        fs::write(dir.join("meta.json"), "broken").unwrap();
        assert!(update_review(&base, "班级/ABC", Some(3), None).is_err());
        assert_eq!(fs::read_to_string(dir.join("meta.json")).unwrap(), "broken");
    }

    #[test]
    fn catalog_includes_nested_projects_but_not_shared_assets() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().to_path_buf();
        for name in ["班级/ABC", "其他班/ABC", "public/library"] {
            let dir = base.join(name); fs::create_dir_all(&dir).unwrap();
            write_meta(&dir, &SketchMeta::default()).unwrap();
        }
        update_review(&base, "班级/ABC", Some(4), Some(true)).unwrap();
        let items = summaries(&base);
        assert_eq!(items.len(), 2);
        let item = items.iter().find(|item| item.path == "班级/ABC").unwrap();
        assert_eq!(item.rating, 4); assert!(item.favorite);
    }
}
