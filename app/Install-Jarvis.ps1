# One-step Jarvis setup: checks the requirements, installs the dependencies,
# and puts a Jarvis shortcut on the Desktop and in the Start menu.
# Safe to run again; it just refreshes everything.

$ErrorActionPreference = 'Stop'
$root     = Split-Path $PSScriptRoot -Parent
$launcher = Join-Path $PSScriptRoot 'Jarvis.ps1'
$icon     = Join-Path $PSScriptRoot 'jarvis.ico'

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "`n$text" -ForegroundColor Red; exit 1 }

Step 'Checking Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail 'Node.js is not installed. Install it from https://nodejs.org (version 20 or newer), then run this again.' }
$major = [int]((node -v).TrimStart('v').Split('.')[0])
if ($major -lt 20) { Fail "Node.js $(node -v) is too old. Install version 20 or newer from https://nodejs.org." }
Write-Host "Node.js $(node -v) found."

Step 'Checking Claude Code'
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Fail 'Claude Code is not installed. Run:  npm install -g @anthropic-ai/claude-code  then run  claude  once to log in, then run this again.'
}
Write-Host 'Claude Code found. (If you have never logged in, run  claude  once first.)'

Step 'Checking for Chrome or Edge'
$browsers = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
if (-not ($browsers | Where-Object { Test-Path $_ })) { Fail 'Jarvis needs Google Chrome or Microsoft Edge.' }
Write-Host 'Browser found.'

Step 'Installing dependencies (about a minute)'
Push-Location $root
try {
    npm install --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { Fail 'npm install failed. Scroll up for the error.' }
} finally { Pop-Location }

Step 'Creating Jarvis shortcuts'
$shell = New-Object -ComObject WScript.Shell
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $s = $shell.CreateShortcut((Join-Path $folder 'Jarvis.lnk'))
    $s.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
    $s.WorkingDirectory = $PSScriptRoot
    $s.IconLocation = "$icon,0"
    $s.Description = 'J.A.R.V.I.S. voice assistant'
    $s.WindowStyle = 7
    $s.Save()
    Write-Host "  $folder\Jarvis.lnk"
}

Write-Host "`nDone. Open Jarvis from the Desktop icon or by searching 'Jarvis' in the Start menu." -ForegroundColor Green
