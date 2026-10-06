# Start the D1A playground on Windows: the D1A model server (d1a.serving.serve with a trained D1A checkpoint) and the web app.
# macOS, Linux and WSL: demo.sh.
#
#   .\demo.ps1                      install what is missing, start both, open the browser; Ctrl+C stops both
#   .\demo.ps1 --media              also start the photo and voice server (d1a.serving.media) for Photo check and Voice triage;
#                                   it loads its model (~10 GB) on the first photo or voice request
#   .\demo.ps1 --no-server          start only the web app, against a model server already running on $env:KEV_PORT
#   .\demo.ps1 --lmstudio URL       no D1A weights: a prompted Gemma 4 chat model in LM Studio answers instead (NOT D1A)
#              [--lmstudio-model ID]   the LM Studio model id (default gemma-4-e4b-it-mlx; Windows ids have no -mlx suffix)
#   .\demo.ps1 --no-browser         do not open the browser
#   .\demo.ps1 stop                 stop what an earlier .\demo.ps1 started (for example after closing its window)
#
# Environment: MODEL_RUN (default JohnP1/d1a-e2b; JohnP1/d1a-e2b-mlx-q8 on Apple Silicon), KEV_PORT (default 8009),
# MEDIA_PORT (default 8010), PORT (web app; default 3001, then 3011, then 3021-3030).
# If PowerShell refuses to run scripts: powershell -ExecutionPolicy Bypass -File .\demo.ps1
# Works in Windows PowerShell 5.1 and PowerShell 7.

$ErrorActionPreference = 'Stop'

# The D1A model server this demo runs, pinned to a commit so every friend gets the same server (mini.sh pins the same one).
$D1aRepo = 'https://github.com/jonpol01/d1a'
$D1aSha = '140a3dea29f7bf57c9be5f70b8349382d363b0c1'
$MediaRun = 'JohnP1/d1a-e2b@v0.2.1-2epoch-calibrated'
$PythonVersion = '3.13'       # torch has no wheels for 3.14 yet; uv downloads 3.13 if it is missing

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$State = Join-Path $Root '.demo'
$Venv = Join-Path $State 'venv'
$KevPort = if ($env:KEV_PORT) { [int]$env:KEV_PORT } else { 8009 }
$OnWindows = ($PSVersionTable.PSEdition -eq 'Desktop') -or $IsWindows
$AppleSilicon = (-not $OnWindows) -and ((& uname -s) -eq 'Darwin') -and ((& uname -m) -eq 'arm64')
# the 8-bit MLX build on Apple Silicon (4.2 GB, no base download), the PyTorch checkpoint elsewhere
$ModelRun = if ($env:MODEL_RUN) { $env:MODEL_RUN } elseif ($AppleSilicon) { 'JohnP1/d1a-e2b-mlx-q8' } else { 'JohnP1/d1a-e2b' }
$MediaPort = if ($env:MEDIA_PORT) { [int]$env:MEDIA_PORT } else { 8010 }

function Say([string]$m) { Write-Host $m }
function Warn([string]$m) { Write-Host "warning: $m" -ForegroundColor Yellow }
function Die([string]$m) { Write-Host "error: $m" -ForegroundColor Red; exit 1 }   # exit still runs the finally block below
$ScriptPath = $MyInvocation.MyCommand.Path
function Show-Usage { Get-Content $ScriptPath -TotalCount 13 | ForEach-Object { $_ -replace '^# ?', '' } }

# ---------------------------------------------------------------- arguments (accepts --no-server and -NoServer styles)
$Command = 'start'; $NoServer = $false; $Media = $false; $LMStudio = ''; $LMStudioModel = 'gemma-4-e4b-it-mlx'; $OpenBrowser = $true
for ($i = 0; $i -lt $args.Count; $i++) {
  $a = [string]$args[$i]
  switch -Regex ($a) {
    '^start$' { $Command = 'start'; break }
    '^stop$' { $Command = 'stop'; break }
    '^--?no-?server$' { $NoServer = $true; break }
    '^--?media$' { $Media = $true; break }
    '^--?no-?browser$' { $OpenBrowser = $false; break }
    '^--?lmstudio-?model$' { if ($i + 1 -ge $args.Count) { Die '--lmstudio-model needs a model id' }; $i++; $LMStudioModel = [string]$args[$i]; break }
    '^--?lmstudio$' { if ($i + 1 -ge $args.Count) { Die '--lmstudio needs a URL, e.g. --lmstudio http://127.0.0.1:1234' }; $i++; $LMStudio = ([string]$args[$i]).TrimEnd('/'); break }
    '^(-h|--help|-help|/\?)$' { Show-Usage; exit 0 }
    default { Show-Usage; Die "unknown argument: $a" }
  }
}
if ($LMStudio -and $NoServer) { Die '--lmstudio and --no-server do not go together' }
if ($Media -and ($LMStudio -or $NoServer)) { Die '--media starts a D1A server; it does not go with --lmstudio or --no-server' }

# ---------------------------------------------------------------- helpers
function Test-PortBusy([int]$port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $ar = $c.BeginConnect('127.0.0.1', $port, $null, $null); $ok = $ar.AsyncWaitHandle.WaitOne(300) -and $c.Connected; return $ok }
  catch { return $false } finally { $c.Close() }
}
function Test-Url([string]$url, [int]$timeout = 3) {
  try { $null = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec $timeout; return $true } catch { return $false }
}
function Test-KevUp { Test-Url "http://127.0.0.1:$KevPort/v1/models" }
function Test-MediaUp { Test-Url "http://127.0.0.1:$MediaPort/v1/models" }

function Select-WebPort {
  if ($env:PORT) { if (Test-PortBusy ([int]$env:PORT)) { Die "PORT=$($env:PORT) is already in use" }; return [int]$env:PORT }
  foreach ($p in @(3001, 3011) + (3021..3030)) { if (-not (Test-PortBusy $p)) { return $p } }
  Die 'no free port for the web app among 3001, 3011, 3021-3030; set $env:PORT to a free port'
}

function Stop-Tree([int]$procId) {
  if (-not (Get-Process -Id $procId -ErrorAction SilentlyContinue)) { return }
  if ($OnWindows) { & taskkill.exe /PID $procId /T /F 2>&1 | Out-Null }   # /T: next dev and uv run have child processes
  else {
    & /bin/kill $procId 2>$null
    for ($n = 0; $n -lt 20 -and (Get-Process -Id $procId -ErrorAction SilentlyContinue); $n++) { Start-Sleep -Milliseconds 500 }
    if (Get-Process -Id $procId -ErrorAction SilentlyContinue) { & /bin/kill -9 $procId 2>$null }
  }
}
function Stop-All {
  Get-ChildItem -Path $State -Filter '*.pid' -ErrorAction SilentlyContinue | ForEach-Object {
    $procId = [int](Get-Content $_.FullName -Raw).Trim()
    Stop-Tree $procId
    Say "stopped $($_.BaseName)"
    Remove-Item $_.FullName -Force
  }
}

function Start-Logged([string]$name, [string]$file, [string[]]$argList) {
  $out = Join-Path $State "$name.log"; $err = Join-Path $State "$name.err.log"
  $p = Start-Process -FilePath $file -ArgumentList $argList -WorkingDirectory $Root -RedirectStandardOutput $out -RedirectStandardError $err -NoNewWindow -PassThru
  Set-Content -Path (Join-Path $State "$name.pid") -Value $p.Id
  return $p
}
function Get-LastLogLine([string]$name) {
  $lines = @()
  foreach ($f in @("$name.err.log", "$name.log")) {
    $path = Join-Path $State $f
    if (Test-Path $path) { $lines += Get-Content $path -Tail 3 -ErrorAction SilentlyContinue }
  }
  $l = ($lines | Where-Object { $_ -and $_.Trim() } | Select-Object -Last 1)
  if ($l) { $l = ($l -split "`r")[-1]; if ($l.Length -gt 110) { $l = $l.Substring(0, 110) } }
  return $l
}
function Show-LogTail([string]$name) {
  foreach ($f in @("$name.log", "$name.err.log")) {
    $path = Join-Path $State $f
    if (Test-Path $path) { Get-Content $path -Tail 20 | ForEach-Object { Write-Host $_ } }
  }
}

New-Item -ItemType Directory -Force -Path $State | Out-Null
if ($Command -eq 'stop') { Stop-All; exit 0 }

# ---------------------------------------------------------------- prerequisites
$missing = $false
function Need([string]$cmd, [string]$hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Say "missing: $cmd  ->  $hint"; $script:missing = $true }
}
Need 'git' 'winget install --id Git.Git -e   (or https://git-scm.com/downloads)'
Need 'node' 'winget install --id OpenJS.NodeJS.LTS -e   (Node.js 20.9 or newer, https://nodejs.org)'
Need 'npm' 'npm comes with Node.js: https://nodejs.org'
if (-not $NoServer) { Need 'uv' 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"   (then open a new window)' }
if ($missing) { Die 'install the missing tools above, then run .\demo.ps1 again' }

$nodeVersion = (& node -p 'process.versions.node').Trim()
$nv = $nodeVersion.Split('.')
if ([int]$nv[0] -lt 20 -or ([int]$nv[0] -eq 20 -and [int]$nv[1] -lt 9)) { Die "Node.js $nodeVersion is too old; Next.js 16 needs 20.9 or newer (winget install OpenJS.NodeJS.LTS)" }

if (Get-ChildItem -Path $State -Filter '*.pid' -ErrorAction SilentlyContinue) { Say 'cleaning up a previous run'; Stop-All }

$procs = @()
try {
  # ---------------------------------------------------------------- the model server (or the LM Studio bridge)
  if ($NoServer) {
    if (-not (Test-KevUp)) { Die "--no-server: nothing answers on http://127.0.0.1:$KevPort/v1/models (start d1a.serving.serve there, or drop --no-server)" }
    Say "Using the model server already running on port $KevPort."
  }
  elseif (Test-KevUp) {
    Say "A System One server is already answering on port $KevPort; using it."
  }
  else {
    if (Test-PortBusy $KevPort) { Die "port $KevPort is taken by something that is not a model server; stop it or set `$env:KEV_PORT" }
    if ($LMStudio) {
      Say "LM Studio mode: answers come from $LMStudioModel, a prompted chat model in LM Studio at $LMStudio."
      Say 'This is NOT the trained D1A checkpoint: no LoRA, no pointer head, uncalibrated probabilities.'
      try { $models = (Invoke-WebRequest -UseBasicParsing -Uri "$LMStudio/v1/models" -TimeoutSec 5).Content }
      catch { Die "LM Studio is not answering at $LMStudio/v1/models (start its server: Developer tab -> Start Server)" }
      if ($models -notmatch [regex]::Escape("`"$LMStudioModel`"")) {
        $gemma = ([regex]::Matches($models, '"id"\s*:\s*"([^"]*gemma[^"]*)"') | ForEach-Object { $_.Groups[1].Value }) -join ' '
        Warn "LM Studio does not list $LMStudioModel. Gemma models it has: $gemma"
        Warn 'pass --lmstudio-model <id> to pick one'
      }
      $procs += Start-Logged 'model-server' 'uv' @('run', '--no-project', '--python', $PythonVersion, '--with', 'fastapi', '--with', 'uvicorn', '--with', 'httpx',
        'python', 'server/lmstudio_systemone.py', '--lmstudio', $LMStudio, '--model', $LMStudioModel, '--port', "$KevPort")
    }
    else {
      $py = if ($OnWindows) { Join-Path $Venv 'Scripts\python.exe' } else { Join-Path $Venv 'bin/python' }
      $extras = if ($Media) { 'serve,media' } else { 'serve' }
      $marker = Join-Path $Venv ".d1a-$D1aSha-$($extras -replace ',', '-')"
      if (-not (Test-Path $marker)) {
        Say "Installing the D1A server (d1a[$extras]) from $D1aRepo@$($D1aSha.Substring(0, 7)) into .demo\venv (first run: about 1 GB of Python packages, more with CUDA)"
        & uv venv --quiet --allow-existing --python $PythonVersion $Venv
        if ($LASTEXITCODE -ne 0) { Die 'uv venv failed' }
        # --torch-backend auto picks the CUDA build of torch when an NVIDIA driver is present (PyPI's Windows torch is CPU-only)
        & uv pip install --quiet --python $py --torch-backend auto "d1a[$extras] @ git+$D1aRepo@$D1aSha"
        if ($LASTEXITCODE -ne 0) { Die 'installing the D1A server failed (see the messages above)' }
        Get-ChildItem -Path $Venv -Force | Where-Object { $_.Name -like '.kev-*' -or $_.Name -like '.d1a-*' } | Remove-Item -Force
        New-Item -ItemType File -Path $marker | Out-Null
      }
      if ($AppleSilicon) {
        # Cap PyTorch's share of unified memory (both are needed: a high cap below the default low of 1.4 is refused).
        if (-not $env:PYTORCH_MPS_HIGH_WATERMARK_RATIO) { $env:PYTORCH_MPS_HIGH_WATERMARK_RATIO = '0.5' }
        if (-not $env:PYTORCH_MPS_LOW_WATERMARK_RATIO) { $env:PYTORCH_MPS_LOW_WATERMARK_RATIO = '0.4' }
        $device = 'Apple Silicon GPU (MLX)'
      }
      elseif (Get-Command nvidia-smi -ErrorAction SilentlyContinue) { $device = 'NVIDIA GPU (CUDA)' }
      else { $device = 'CPU (works, but slow: several seconds per request)' }
      if ($OnWindows) {
        $memGb = [math]::Floor((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
        if ($memGb -lt 16) { Warn "this PC has $memGb GB of memory; the model server peaks around 15 GB. If it runs out, use --lmstudio instead." }
      }
      Say "Starting the model server (d1a.serving.serve): $ModelRun on $device, port $KevPort (logs: .demo\model-server*.log)"
      if ($AppleSilicon) { Say 'The first start downloads the 8-bit MLX model (about 4 GB); later starts take a few seconds.' }
      else { Say 'The first start downloads Gemma 4 E2B (about 10 GB) and the adapter; later starts take about 20 s.' }
      $procs += Start-Logged 'model-server' $py @('-m', 'd1a.serving.serve', '--run', $ModelRun, '--port', "$KevPort")
    }

    $t0 = Get-Date; $last = $t0
    while (-not (Test-KevUp)) {
      if ($procs[-1].HasExited) { Say 'The server exited. Last lines of its log:'; Show-LogTail 'model-server'; Die 'the model server did not start (see .demo\model-server*.log)' }
      if (((Get-Date) - $last).TotalSeconds -ge 15) {
        $last = Get-Date
        Say ("  waiting for the server ({0:N0} s): {1}" -f ((Get-Date) - $t0).TotalSeconds, (Get-LastLogLine 'model-server'))
      }
      Start-Sleep -Seconds 1
    }
    Say ("Server ready on http://127.0.0.1:{0} after {1:N0} s." -f $KevPort, ((Get-Date) - $t0).TotalSeconds)

    # ---------------------------------------------------------------- the photo and voice server (--media)
    if ($Media) {
      if (Test-MediaUp) { Say "A media server is already answering on port $MediaPort; using it." }
      else {
        if (Test-PortBusy $MediaPort) { Die "port $MediaPort is taken; stop what uses it or set `$env:MEDIA_PORT" }
        Say "Starting the photo and voice server (d1a.serving.media): $MediaRun, port $MediaPort (logs: .demo\media-server*.log)"
        Say 'It loads its model (Gemma 4 with its vision and audio encoders, about 10 GB) on the first photo or voice request.'
        $procs += Start-Logged 'media-server' $py @('-m', 'd1a.serving.media', '--run', $MediaRun, '--port', "$MediaPort")
        $t0 = Get-Date
        while (-not (Test-MediaUp)) {
          if ($procs[-1].HasExited) { Show-LogTail 'media-server'; Die 'the media server did not start (see .demo\media-server*.log)' }
          if (((Get-Date) - $t0).TotalSeconds -gt 300) { Die 'the media server did not answer within 5 minutes (see .demo\media-server*.log)' }
          Start-Sleep -Seconds 1
        }
        Say "Photo and voice server ready on http://127.0.0.1:$MediaPort."
      }
    }
  }

  # ---------------------------------------------------------------- the web app
  Set-Location $Root
  $stamp = Join-Path $Root 'node_modules/.package-lock.json'
  if (-not (Test-Path $stamp) -or (Get-Item -Force (Join-Path $Root 'package-lock.json')).LastWriteTime -gt (Get-Item -Force $stamp).LastWriteTime) {
    Say "Installing the web app's packages (npm ci)"
    & npm ci --no-audit --no-fund --loglevel=error
    if ($LASTEXITCODE -ne 0) { Die 'npm ci failed' }
  }
  $webPort = Select-WebPort
  Say "Starting the web app on port $webPort (logs: .demo\web*.log)"
  $env:KEV_API = "http://127.0.0.1:$KevPort"; $env:MEDIA_API = "http://127.0.0.1:$MediaPort"; $env:NEXT_TELEMETRY_DISABLED = '1'
  $node = (Get-Command node).Source
  $procs += Start-Logged 'web' $node @('node_modules/next/dist/bin/next', 'dev', '-p', "$webPort")
  $url = "http://localhost:$webPort"
  for ($n = 0; $n -lt 120 -and -not (Test-Url "$url/" 30); $n++) {
    if ($procs[-1].HasExited) { Show-LogTail 'web'; Die 'the web app did not start (see .demo\web*.log)' }
    Start-Sleep -Seconds 1
  }
  if (-not (Test-Url "$url/kev/v1/models" 5)) { Warn 'the web app cannot reach the model server through its /kev proxy' }

  Say ''
  Say 'D1A playground is running:'
  if ($Media) { Say "  $url                the eleven demos" }
  else { Say "  $url                the demos (Photo check and Voice triage need --media)" }
  Say "  $url/#inbox         jump to one (#routing #guardrails #tools #inbox #rerank #evals #labeling #control #gate #photo #voice)"
  Say "  http://127.0.0.1:$KevPort/v1/models   the server's model card"
  if ($LMStudio) { Say '  (LM Studio mode: a prompted chat model answers, NOT the trained D1A checkpoint)' }
  Say 'Press Ctrl+C to stop (or run .\demo.ps1 stop from another window).'
  if ($OpenBrowser) { if ($OnWindows) { Start-Process $url } elseif ((& uname -s) -eq 'Darwin') { & open $url } }

  while ($true) {
    foreach ($p in $procs) { if ($p.HasExited) { Warn 'a process exited; see the logs in .demo\'; return } }
    Start-Sleep -Seconds 2
  }
}
finally {
  # Runs on Ctrl+C, on errors and on a normal exit: stop only what this script started.
  Say ''; Say 'stopping...'
  Stop-All
}
