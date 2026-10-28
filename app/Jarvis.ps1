# Jarvis launcher: starts the bridge + face in the background, opens Jarvis in
# its own app window, and shuts everything down when that window is closed.

$appDir     = Split-Path $PSScriptRoot -Parent   # the repo root, wherever it was cloned
$url        = 'http://localhost:5173'
$dataDir    = Join-Path $env:LOCALAPPDATA 'JarvisApp'
$profileDir = Join-Path $dataDir 'browser-profile'
$logFile    = Join-Path $dataDir 'jarvis.log'

New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
Add-Type -AssemblyName System.Windows.Forms

function Test-Port($port) {
    [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Show-Error($message) {
    [System.Windows.Forms.MessageBox]::Show($message, 'Jarvis', 'OK', 'Error') | Out-Null
}

# Start the server only if it isn't already running (e.g. from a terminal).
$server = $null
if (-not (Test-Port 5173)) {
    $server = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', "npm start > `"$logFile`" 2>&1" `
        -WorkingDirectory $appDir -WindowStyle Hidden -PassThru

    $deadline = (Get-Date).AddSeconds(60)
    while (-not ((Test-Port 5173) -and (Test-Port 8787))) {
        if ($server.HasExited -or (Get-Date) -gt $deadline) {
            if (-not $server.HasExited) { taskkill /PID $server.Id /T /F | Out-Null }
            Show-Error "Jarvis could not start. Details are in:`n$logFile"
            exit 1
        }
        Start-Sleep -Milliseconds 500
    }
}

# Prefer Chrome, fall back to Edge. Both handle the microphone and WebGL.
$browser = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browser) {
    if ($server) { taskkill /PID $server.Id /T /F | Out-Null }
    Show-Error 'Jarvis needs Google Chrome or Microsoft Edge installed.'
    exit 1
}

# A separate browser profile keeps the Jarvis window its own process, so we can
# tell when it closes. The microphone permission is remembered in this profile.
$window = Start-Process -FilePath $browser -PassThru -ArgumentList @(
    "--app=$url",
    "--user-data-dir=`"$profileDir`"",
    '--start-maximized',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required'
)
$window.WaitForExit()

# Only stop the server if this launcher started it.
if ($server -and -not $server.HasExited) {
    taskkill /PID $server.Id /T /F | Out-Null
}
