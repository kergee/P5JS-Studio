# Requires PowerShell 7, Tabbit and a running Vite preview on 127.0.0.1:1421.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$cli = Join-Path $env:LOCALAPPDATA 'Tabbit/LocalAgent/bin/tabbit-cli.exe'
if (-not (Test-Path -LiteralPath $cli)) { throw 'Tabbit CLI is not installed.' }
$taskName = 'P5 Studio Serial Smoke'
$runId = [guid]::NewGuid().ToString('N')
$outputDir = Join-Path $repoRoot "artifacts/validation/serial-$runId"
New-Item -ItemType Directory -Path $outputDir | Out-Null
$samples = @{}
foreach ($entry in @(@('led','ESP32-02-画布控制LED'), @('def','DEF-本地图片与声音'), @('ghi','GHI-p5js2异步资源'))) {
    $folder = Join-Path $repoRoot "examples/$($entry[1])"
    $meta = Get-Content -LiteralPath (Join-Path $folder 'meta.json') -Raw | ConvertFrom-Json
    $assets = @{}
    foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $folder 'assets') -File -ErrorAction SilentlyContinue)) {
        $mime = switch ($file.Extension) { '.svg' { 'image/svg+xml' } '.wav' { 'audio/wav' } default { 'application/octet-stream' } }
        $assets["assets/$($file.Name)"] = "data:$mime;base64," + [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))
    }
    $samples[$entry[0]] = @{ code = Get-Content -LiteralPath (Join-Path $folder 'sketch.js') -Raw; assets = $assets; p5Version = $meta.p5Version }
}
$sensor = Get-Content -LiteralPath (Join-Path $repoRoot 'examples/ESP32-01-传感器控制画面/sketch.js') -Raw
$fixture = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'serial-fixture.js') -Raw
$fixture = $fixture.Replace('__EXAMPLES_JSON__', ($samples | ConvertTo-Json -Depth 10 -Compress)).Replace('__SENSOR_CODE_JSON__', ($sensor | ConvertTo-Json -Compress))
Set-Content -LiteralPath (Join-Path $outputDir 'fixture.js') -Value $fixture -Encoding utf8

function Invoke-BrowserCheck([string]$name, [string]$script) {
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $cli
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    foreach ($arg in @('nodejs','--task',$taskName,'--request-id',"$runId-$name")) { $startInfo.ArgumentList.Add($arg) }
    $process = [Diagnostics.Process]::Start($startInfo)
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write([IO.File]::ReadAllText($script))
    $process.StandardInput.Close()
    $process.WaitForExit()
    $stdout.Result | Tee-Object -FilePath (Join-Path $outputDir "$name.txt")
    if ($stderr.Result) { Write-Output $stderr.Result }
    if ($process.ExitCode -ne 0) { throw "Browser check failed: $name (see $outputDir)" }
}

& $cli create --task $taskName | Out-Null
try {
    Invoke-BrowserCheck 'fixture' (Join-Path $outputDir 'fixture.js')
    foreach ($name in @('smoke','matrix','examples','lifecycle','mobile')) {
        Invoke-BrowserCheck $name (Join-Path $PSScriptRoot "serial-$name.js")
    }
} finally {
    Set-Content -LiteralPath (Join-Path $outputDir 'close.js') -Value 'await page.close(); return {closed:true};' -Encoding utf8
    try { Invoke-BrowserCheck 'close' (Join-Path $outputDir 'close.js') }
    finally { & $cli finish --task $taskName }
}
Write-Output "Software-only verification receipts: $outputDir"
