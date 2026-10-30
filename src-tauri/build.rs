fn main() {
    // The Windows executable embeds icons at build-script time, not only at bundle time.
    println!("cargo:rerun-if-changed=icons");
    let p5_package = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../node_modules/p5/package.json");
    println!("cargo:rerun-if-changed={}", p5_package.display());
    let package: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&p5_package)
            .expect("p5 package is missing; run npm ci before building"),
    ).expect("invalid p5 package.json");
    let version = package["version"].as_str().expect("p5 package version is missing");
    println!("cargo:rustc-env=P5JS_STUDIO_P5_VERSION={version}");
    tauri_build::build()
}
