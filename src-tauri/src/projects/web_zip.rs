//! Convert a classic p5.js web project to the Studio project layout.
use super::*;
use kuchikiki::traits::TendrilSink;
use percent_encoding::percent_decode_str;
use tauri::Url;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedWebProject {
    path: String,
    source_version: String,
    p5_version: String,
}

fn web_root(files: &mut BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    files.retain(|path, _| {
        !path.starts_with("__MACOSX/") && !path.split('/').any(|name| name == ".DS_Store")
    });
    if files.contains_key("index.html") {
        return Ok(());
    }
    if let Some(wrapper) = files
        .keys()
        .next()
        .and_then(|name| name.split_once('/'))
        .map(|(dir, _)| format!("{dir}/"))
    {
        if files.contains_key(&format!("{wrapper}index.html"))
            && files.keys().all(|name| name.starts_with(&wrapper))
        {
            *files = std::mem::take(files)
                .into_iter()
                .map(|(name, bytes)| (name[wrapper.len()..].to_string(), bytes))
                .collect();
            return Ok(());
        }
    }
    Err("Expected index.html at the ZIP root or inside one enclosing folder".into())
}

fn script_path(source: &str) -> Result<String, String> {
    let source = source.split(['?', '#']).next().unwrap_or_default();
    let decoded = percent_decode_str(source)
        .decode_utf8()
        .map_err(|_| "Invalid UTF-8 script path")?;
    let path = decoded.trim_start_matches('/').trim_start_matches("./");
    safe_path(&PathBuf::from("project"), path)?;
    Ok(path.to_string())
}

fn runtime_version(source: &str) -> Option<&str> {
    if let Some(version) = source
        .trim_start_matches('\u{feff}')
        .trim_start()
        .strip_prefix("/*! p5.js v")
    {
        return version.split_whitespace().next();
    }
    // The p5 2.x minified build currently puts its version after the PI constant.
    let minified = source.strip_prefix("var p5=function()")?;
    let (_, constants) = minified
        .get(..minified.len().min(180))?
        .split_once("=Math.PI,")?;
    let (_, value) = constants.split_once("=\"")?;
    value.split_once('"').map(|(version, _)| version)
}

fn cdn_runtime(url: &Url) -> Option<(&str, bool)> {
    let path = url.path();
    let filename = path.rsplit('/').next()?;
    let sound = matches!(filename, "p5.sound.js" | "p5.sound.min.js");
    let core = matches!(filename, "p5.js" | "p5.min.js");
    if !core && !sound {
        return None;
    }
    let package = match url.host_str()? {
        "cdn.jsdelivr.net" => path.strip_prefix("/npm/")?,
        "unpkg.com" => path.strip_prefix('/')?,
        "cdnjs.cloudflare.com" => {
            let version = path.strip_prefix("/ajax/libs/p5.js/")?.split('/').next()?;
            return Some((version, sound));
        }
        _ => return None,
    };
    let version = package
        .strip_prefix("p5@")
        .or_else(|| {
            if sound {
                package.strip_prefix("p5.sound@")
            } else {
                None
            }
        })?
        .split('/')
        .next()?;
    Some((version, sound))
}

fn bundled_version(version: &str) -> Result<String, String> {
    let major = version.split('.').next().unwrap_or_default();
    match major {
        "1" => Ok(default_p5_version()),
        "2" => Ok(env!("P5JS_STUDIO_P5_V2_VERSION").into()),
        _ => Err(format!("Unsupported p5.js version: {version}")),
    }
}

fn scripts(document: &str) -> Result<Vec<(Option<String>, String)>, String> {
    let document = kuchikiki::parse_html().one(document).document_node;
    if document.select_first("base[href]").is_ok() {
        return Err("HTML base URLs are not supported by the p5.js ZIP importer".into());
    }
    let mut immediate = Vec::new();
    let mut deferred = Vec::new();
    for node in document
        .select("script")
        .map_err(|_| "Could not read HTML scripts")?
    {
        let attributes = node.attributes.borrow();
        let source = attributes.get("src").map(str::trim);
        let kind = attributes
            .get("type")
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        if kind == "module" || kind == "importmap" {
            return Err("Module scripts and import maps require the original webpage".into());
        }
        if !matches!(
            kind.as_str(),
            "" | "text/javascript"
                | "application/javascript"
                | "text/ecmascript"
                | "application/ecmascript"
        ) || attributes.contains("nomodule")
        {
            continue;
        }
        if source.is_some() && attributes.contains("async") {
            return Err(format!(
                "Async script order cannot be converted: {}",
                source.unwrap_or_default()
            ));
        }
        let code = if source.is_none() {
            node.text_contents()
        } else {
            String::new()
        };
        if source.is_none() && code.trim().is_empty() {
            continue;
        }
        let script = (source.map(str::to_owned), code);
        if source.is_some() && attributes.contains("defer") {
            deferred.push(script);
        } else {
            immediate.push(script);
        }
    }
    immediate.extend(deferred);
    Ok(immediate)
}

fn next_tab_name(used: &mut HashSet<String>, basename: &str) -> String {
    let stem = basename.strip_suffix(".js").unwrap_or(basename);
    let mut name = format!("{stem}.js");
    let mut suffix = 2;
    while !used.insert(name.to_lowercase()) {
        name = format!("{stem} ({suffix}).js");
        suffix += 1;
    }
    name
}

fn convert_web_zip(files: &mut BTreeMap<String, Vec<u8>>) -> Result<(String, String), String> {
    web_root(files)?;
    html::validate_share_paths(files)?;
    if files
        .keys()
        .any(|name| name.eq_ignore_ascii_case("meta.json"))
    {
        return Err(
            "This ZIP contains meta.json. Use the Project ZIP import option for Studio archives."
                .into(),
        );
    }
    let index = std::str::from_utf8(&files["index.html"]).map_err(|_| "index.html is not UTF-8")?;
    let script_tags = scripts(index)?;
    let mut reserved: HashSet<String> = files
        .keys()
        .map(|path| path.split('/').next().unwrap_or(path).to_lowercase())
        .collect();
    let mut runtime = None;
    let mut tabs = Vec::new();
    let mut active_paths = HashSet::new();
    for (source, inline_code) in script_tags {
        let Some(source) = source else {
            if runtime.is_none() {
                return Err("Put the p5.js runtime before the sketch scripts".into());
            }
            let name = next_tab_name(&mut reserved, "inline");
            files.insert(name.clone(), inline_code.into_bytes());
            tabs.push(name);
            continue;
        };
        if source.starts_with("//") || Url::parse(&source).is_ok() {
            let url = if source.starts_with("//") {
                Url::parse(&format!("https:{source}"))
            } else {
                Url::parse(&source)
            }
            .map_err(|_| format!("Invalid script URL: {source}"))?;
            let (version, sound) = cdn_runtime(&url)
                .filter(|_| matches!(url.scheme(), "https" | "http"))
                .ok_or_else(|| format!("Include this script locally in the ZIP: {source}"))?;
            if sound {
                if runtime.is_none() {
                    return Err("Put p5.sound after the p5.js runtime".into());
                }
            } else if runtime.replace(version.to_owned()).is_some() {
                return Err("Expected exactly one p5.js runtime".into());
            }
            continue;
        }
        let path = script_path(&source)?;
        let code = files
            .get(&path)
            .ok_or_else(|| format!("Missing script: {source}"))?;
        let code_text =
            std::str::from_utf8(code).map_err(|_| format!("Script is not UTF-8: {path}"))?;
        let basename = path.rsplit('/').next().unwrap_or(&path);
        if matches!(basename, "p5.js" | "p5.min.js") {
            let version = runtime_version(code_text)
                .ok_or_else(|| format!("Could not identify the p5.js version in {path}"))?;
            if runtime.replace(version.to_owned()).is_some() {
                return Err("Expected exactly one p5.js runtime".into());
            }
            continue;
        }
        if runtime.is_none() {
            return Err("Put the p5.js runtime before the sketch scripts".into());
        }
        if matches!(basename, "p5.sound.js" | "p5.sound.min.js") {
            continue;
        }
        if !active_paths.insert(path.clone()) {
            return Err(format!("Script referenced more than once: {source}"));
        }
        let name = if !path.contains('/') && path.to_lowercase().ends_with(".js") {
            path
        } else {
            let name = next_tab_name(&mut reserved, basename);
            files.insert(name.clone(), code.clone());
            name
        };
        tabs.push(name);
    }
    let source_version = runtime.ok_or("No supported p5.js runtime was found in index.html")?;
    let p5_version = bundled_version(&source_version)?;
    let meta = SketchMeta {
        files: tabs,
        p5_version: p5_version.clone(),
        ..SketchMeta::default()
    };
    files.insert(
        "meta.json".into(),
        serde_json::to_vec(&meta).map_err(|e| e.to_string())?,
    );
    html::validate_share_paths(files)?;
    validate_project_files(files)?;
    Ok((source_version, p5_version))
}

fn import_web_zip_into(
    base: &PathBuf,
    path: &str,
    parent: &str,
) -> Result<ImportedWebProject, String> {
    let mut files = read_zip(path)?;
    let (source_version, p5_version) = convert_web_zip(&mut files)?;
    let name = Path::new(path)
        .file_stem()
        .and_then(|name| name.to_str())
        .ok_or("Invalid ZIP filename")?;
    let path = install_project_files(base, &files, parent, name, false)?
        .ok_or("Could not install project")?;
    Ok(ImportedWebProject {
        path,
        source_version,
        p5_version,
    })
}

#[tauri::command]
pub async fn import_p5_web_zip(
    app: AppHandle,
    zip_path: String,
    target_folder: String,
) -> Result<ImportedWebProject, String> {
    tauri::async_runtime::spawn_blocking(move || {
        import_web_zip_into(&sketches_dir(&app), &zip_path, &target_folder)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files(entries: &[(&str, &str)]) -> BTreeMap<String, Vec<u8>> {
        entries
            .iter()
            .map(|(path, text)| (path.to_string(), text.as_bytes().to_vec()))
            .collect()
    }

    #[test]
    fn web_zip_import_keeps_assets_and_creates_ordered_editable_tabs() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("sketches");
        fs::create_dir(&base).unwrap();
        let zip = temp.path().join("学生作品.zip");
        let archive = files(&[
            ("__MACOSX/._index.html", "ignored metadata"),
            (
                "作品/index.html",
                r#"
                <link rel="stylesheet" href="style.css">
                <script defer src="https://cdn.jsdelivr.net/npm/p5@1.11.5/lib/p5.min.js"></script>
                <script defer src="https://cdn.jsdelivr.net/npm/p5@1.11.5/lib/addons/p5.sound.min.js"></script>
                <script defer src='scripts/shared%20file.js?v=1'></script>
                <script defer src="sketch.js"></script>
            "#,
            ),
            ("作品/style.css", "canvas { display: block; }"),
            ("作品/scripts/shared file.js", "const size = 80;"),
            (
                "作品/sketch.js",
                "function setup() { createCanvas(size, size); }",
            ),
            ("作品/assets/value.json", "{\"value\":42}"),
        ]);
        write_zip(zip.to_str().unwrap(), &archive).unwrap();
        let imported = import_web_zip_into(&base, zip.to_str().unwrap(), "Class").unwrap();
        assert_eq!(imported.path, "Class/学生作品");
        assert_eq!(imported.source_version, "1.11.5");
        assert_eq!(imported.p5_version, default_p5_version());
        let dir = base.join(&imported.path);
        assert_eq!(
            read_meta_checked(&dir).unwrap().files,
            ["shared file.js", "sketch.js"]
        );
        assert_eq!(
            fs::read(dir.join("shared file.js")).unwrap(),
            b"const size = 80;"
        );
        assert_eq!(
            fs::read(dir.join("assets/value.json")).unwrap(),
            b"{\"value\":42}"
        );
        assert!(dir.join("index.html").is_file() && dir.join("style.css").is_file());
        let duplicate = import_web_zip_into(&base, zip.to_str().unwrap(), "Class").unwrap();
        assert_eq!(duplicate.path, "Class/学生作品 (2)");
    }

    #[test]
    fn web_zip_detects_local_p5_v2_and_keeps_inline_order() {
        let mut archive = files(&[
            (
                "index.html",
                r#"<script src="lib/p5.min.js"></script><script>const size=42;</script><script src="sketch.js"></script>"#,
            ),
            (
                "lib/p5.min.js",
                r#"var p5=function(){"use strict";const t=Math.PI,r="2.2.1",i="p2d";"#,
            ),
            ("sketch.js", "function setup(){createCanvas(size,size);}"),
        ]);
        let (source, selected) = convert_web_zip(&mut archive).unwrap();
        assert_eq!(source, "2.2.1");
        assert_eq!(selected, env!("P5JS_STUDIO_P5_V2_VERSION"));
        assert_eq!(
            validate_project_files(&archive).unwrap().files,
            ["inline.js", "sketch.js"]
        );
    }

    #[test]
    fn web_zip_rejects_incomplete_or_incompatible_archives_before_installation() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("sketches");
        fs::create_dir(&base).unwrap();
        let zip = temp.path().join("invalid.zip");
        let runtime =
            r#"<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.13/p5.js"></script>"#;
        for (extra, error) in [
            (r#"<script src="missing.js"></script>"#, "Missing script"),
            (
                r#"<script src="https://example.invalid/other.js"></script>"#,
                "Include this script locally",
            ),
            (
                r#"<script type="module" src="sketch.js"></script>"#,
                "Module scripts",
            ),
            (r#"<script src="../escape.js"></script>"#, "invalid path"),
        ] {
            let archive = files(&[("index.html", &format!("{runtime}{extra}"))]);
            write_zip(zip.to_str().unwrap(), &archive).unwrap();
            let result = import_web_zip_into(&base, zip.to_str().unwrap(), "Class")
                .err()
                .unwrap();
            assert!(result.contains(error), "{result}");
            assert_eq!(fs::read_dir(&base).unwrap().count(), 0);
        }
    }
}
