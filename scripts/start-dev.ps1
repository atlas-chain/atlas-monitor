param(
  [int]$Port = 4177,
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PidFile = Join-Path $Root ".monitor-server.pid"
$LogFile = Join-Path $Root ".monitor-server.log"
$ErrLogFile = Join-Path $Root ".monitor-server.err.log"

function Get-NodeExe {
  if ($env:NODE_EXE -and (Test-Path $env:NODE_EXE)) {
    return $env:NODE_EXE
  }

  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    return $nodeCommand.Source
  }

  $codexNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path $codexNode) {
    return $codexNode
  }

  throw "Node.js was not found. Install Node 20+, or set NODE_EXE to node.exe."
}

if (Test-Path $PidFile) {
  $existingPid = Get-Content $PidFile -ErrorAction SilentlyContinue
  if ($existingPid) {
    $existing = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($existing) {
      Write-Host "Atlas Monitor already running at http://${HostName}:$Port (pid $existingPid)"
      exit 0
    }
  }
}

$node = Get-NodeExe
Set-Content -Path $LogFile -Value "Starting Atlas Monitor with $node"
Set-Content -Path $ErrLogFile -Value ""

$env:APP_HOST = $HostName
$env:APP_PORT = [string]$Port

$process = Start-Process `
  -FilePath $node `
  -ArgumentList @("server/index.js") `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -PassThru

Set-Content -Path $PidFile -Value $process.Id

$healthUrl = "http://${HostName}:$Port/healthz"
for ($attempt = 1; $attempt -le 20; $attempt++) {
  Start-Sleep -Milliseconds 250
  try {
    Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2 | Out-Null
    Write-Host "Atlas Monitor running at http://${HostName}:$Port (pid $($process.Id))"
    exit 0
  } catch {
    if ($process.HasExited) {
      throw "Atlas Monitor exited early. See $LogFile and $ErrLogFile."
    }
  }
}

throw "Atlas Monitor did not become healthy. See $LogFile and $ErrLogFile."
