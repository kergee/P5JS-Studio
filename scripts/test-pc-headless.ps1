# Run real React/CodeMirror/p5 checks in an isolated, invisible browser.
$ErrorActionPreference = 'Stop'
$pcTestRoot = Split-Path $PSScriptRoot -Parent
Push-Location $pcTestRoot
$pcViteProcess = $null
try {
    New-Item -ItemType Directory -Force 'artifacts/validation/pc-workflow' | Out-Null
    $pcNodePath = (Get-Command node).Source
    $pcViteProcess = Start-Process -FilePath $pcNodePath -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1424','--strictPort') -WindowStyle Hidden -PassThru -RedirectStandardOutput 'artifacts/validation/pc-workflow/vite.log' -RedirectStandardError 'artifacts/validation/pc-workflow/vite-error.log'
    $pcViteReady = $false
    for ($pcAttempt = 0; $pcAttempt -lt 60; $pcAttempt++) {
        if ($pcViteProcess.HasExited) { throw 'Vite exited before the test server was ready.' }
        try { $pcResponse = Invoke-WebRequest 'http://127.0.0.1:1424/' -TimeoutSec 2; if ($pcResponse.StatusCode -eq 200) { $pcViteReady=$true; break } } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (-not $pcViteReady) { throw 'Test server was not ready within the startup deadline.' }
    & node tests/headless/pc-workflow.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Headless PC workflow checks failed.' }
    $pcReceipt = Get-Content 'artifacts/validation/pc-workflow/headless-results.json' -Raw | ConvertFrom-Json
    if (-not $pcReceipt.success) { throw 'Headless checks did not produce a complete success receipt.' }
} finally {
    if ($pcViteProcess -and -not $pcViteProcess.HasExited) { Stop-Process -Id $pcViteProcess.Id }
    Pop-Location
}
