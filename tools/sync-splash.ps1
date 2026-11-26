# Sync Deepsea splash art into WeChat build templates / last build output.
# Usage: powershell -File tools/sync-splash.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'assets\resources\art\loading-splash.png'
$template = Join-Path $root 'build-templates\wechatgame\splash.png'
$built = Join-Path $root 'build\wechatgame\splash.png'

if (-not (Test-Path -LiteralPath $src)) {
    throw "Missing splash source: $src"
}

New-Item -ItemType Directory -Force -Path (Split-Path $template) | Out-Null
Copy-Item -LiteralPath $src -Destination $template -Force
Write-Host "Updated $template"

if (Test-Path -LiteralPath (Split-Path $built)) {
    Copy-Item -LiteralPath $src -Destination $built -Force
    Write-Host "Updated $built"
} else {
    Write-Host "No build/wechatgame yet — template will apply on next WeChat build."
}
