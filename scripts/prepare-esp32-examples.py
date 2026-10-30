"""Rebuild anonymous teaching ZIPs with canonical UTF-8/LF source files."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent.parent
text_extensions = {".js", ".json", ".md", ".ino", ".h", ".txt", ".svg"}
for project in sorted((root / "examples").glob("ESP32-*")):
    if not project.is_dir():
        continue
    with ZipFile(project.with_suffix(".zip"), "w", compression=ZIP_DEFLATED) as archive:
        for source in sorted(project.rglob("*")):
            if not source.is_file():
                continue
            content = source.read_bytes()
            if source.suffix.lower() in text_extensions:
                content = content.replace(b"\r\n", b"\n")
            entry = ZipInfo(source.relative_to(project).as_posix(), (2026, 10, 30, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, content)
    print(project.name)
