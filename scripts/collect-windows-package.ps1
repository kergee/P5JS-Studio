$ErrorActionPreference = 'Stop'
$pcPackageRoot = Split-Path $PSScriptRoot -Parent
Push-Location $pcPackageRoot
try {
    $pcPackageOutput = 'artifacts/ci-package'
    New-Item -ItemType Directory -Force $pcPackageOutput | Out-Null
    $pcInstallers = @(Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter '*.exe' -File) + @(Get-ChildItem 'src-tauri/target/release/bundle/msi' -Filter '*.msi' -File)
    if ($pcInstallers.Count -ne 2) { throw 'Expected one EXE and one MSI in the clean CI build.' }
    $pcPackageRecords = foreach ($pcInstallerFile in $pcInstallers) {
        Copy-Item -LiteralPath $pcInstallerFile.FullName -Destination $pcPackageOutput
        [ordered]@{file=$pcInstallerFile.Name;size=$pcInstallerFile.Length;sha256=(Get-FileHash -LiteralPath $pcInstallerFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    $pcPackageRecords | ForEach-Object { "$($_.sha256)  $($_.file)" } | Set-Content "$pcPackageOutput/SHA256SUMS.txt" -Encoding ascii
    [ordered]@{commit=$env:GITHUB_SHA;runId=$env:GITHUB_RUN_ID;event=$env:GITHUB_EVENT_NAME;version=(Get-Content package.json -Raw | ConvertFrom-Json).version;files=@($pcPackageRecords)} | ConvertTo-Json -Depth 5 | Set-Content "$pcPackageOutput/build-info.json" -Encoding utf8
    Copy-Item -LiteralPath docs/pc-update-20261030.zh-CN.md -Destination "$pcPackageOutput/更新说明.md"
    if ($env:GITHUB_STEP_SUMMARY) {
        @('## Windows test packages', '', 'EXE and MSI are alternatives. The application version remains 1.3.2; identify this test build by commit and run ID.', '', ($pcPackageRecords | ForEach-Object { "- $($_.file): $($_.size) bytes" })) | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
    }
} finally { Pop-Location }
