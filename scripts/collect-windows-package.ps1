$ErrorActionPreference = 'Stop'
$pcPackageRoot = Split-Path $PSScriptRoot -Parent
Push-Location $pcPackageRoot
try {
    $pcPackageOutput = 'artifacts/ci-package'
    New-Item -ItemType Directory -Force $pcPackageOutput | Out-Null
    $pcVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
    $pcTauriConfig = Get-Content src-tauri/tauri.conf.json -Raw | ConvertFrom-Json
    if ($pcTauriConfig.version -ne $pcVersion) { throw 'Application and installer versions differ.' }
    $pcInstallerName = "$($pcTauriConfig.productName)_${pcVersion}_x64-setup.exe"
    $pcInstallers = @(Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter $pcInstallerName -File)
    if ($pcInstallers.Count -ne 1) { throw "Expected exactly one $pcInstallerName installer." }
    $pcPackageRecords = foreach ($pcInstallerFile in $pcInstallers) {
        Copy-Item -LiteralPath $pcInstallerFile.FullName -Destination $pcPackageOutput
        [ordered]@{file=$pcInstallerFile.Name;size=$pcInstallerFile.Length;sha256=(Get-FileHash -LiteralPath $pcInstallerFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    $pcPackageRecords | ForEach-Object { "$($_.sha256)  $($_.file)" } | Set-Content "$pcPackageOutput/SHA256SUMS.txt" -Encoding ascii
    [ordered]@{commit=$env:GITHUB_SHA;runId=$env:GITHUB_RUN_ID;event=$env:GITHUB_EVENT_NAME;version=$pcVersion;files=@($pcPackageRecords)} | ConvertTo-Json -Depth 5 | Set-Content "$pcPackageOutput/build-info.json" -Encoding utf8
    Copy-Item -LiteralPath docs/pc-update-1.4.1.zh-CN.md -Destination "$pcPackageOutput/更新说明.md"
    if ($env:GITHUB_STEP_SUMMARY) {
        @("## Windows EXE package ($pcVersion)", '', ($pcPackageRecords | ForEach-Object { "- $($_.file): $($_.size) bytes" })) | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
    }
} finally { Pop-Location }
