# Regenerate desktop icon formats from the shared HarmonyOS vector design.
$ErrorActionPreference = 'Stop'
$desktopIconRoot = Split-Path $PSScriptRoot -Parent
Push-Location $desktopIconRoot
try {
    $desktopIconStage = Join-Path 'artifacts/icon-generation' ([guid]::NewGuid().ToString('N'))
    & npm run tauri icon -- app-icon.svg --output (Join-Path $desktopIconStage 'generated')
    if ($LASTEXITCODE -ne 0) { throw 'Desktop icon generation failed.' }
    & npm run tauri icon -- app-icon.svg --png 1024 --output (Join-Path $desktopIconStage 'master')
    if ($LASTEXITCODE -ne 0) { throw 'Master PNG generation failed.' }
    # Copy only desktop files. Generated mobile variants stay in ignored artifacts.
    foreach ($desktopIconFile in Get-ChildItem -LiteralPath (Join-Path $desktopIconStage 'generated') -File) {
        Copy-Item -LiteralPath $desktopIconFile.FullName -Destination (Join-Path 'src-tauri/icons' $desktopIconFile.Name)
    }
    Copy-Item -LiteralPath (Join-Path $desktopIconStage 'master/1024x1024.png') -Destination 'app-icon.png'
} finally { Pop-Location }
