$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PidFile = Join-Path $Root ".monitor-server.pid"

if (!(Test-Path $PidFile)) {
  Write-Host "Atlas Monitor is not running: no PID file found."
  exit 0
}

$monitorPid = Get-Content $PidFile -ErrorAction SilentlyContinue
if (!$monitorPid) {
  Remove-Item $PidFile -Force
  Write-Host "Atlas Monitor is not running: empty PID file removed."
  exit 0
}

$process = Get-Process -Id $monitorPid -ErrorAction SilentlyContinue
if (!$process) {
  Remove-Item $PidFile -Force
  Write-Host "Atlas Monitor is not running: stale PID file removed."
  exit 0
}

Stop-Process -Id $monitorPid -Force
Remove-Item $PidFile -Force
Write-Host "Stopped Atlas Monitor (pid $monitorPid)."
