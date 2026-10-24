# demo.ps1's port picker and pid-file cleanup, the functions themselves (read out of demo.ps1 through PowerShell's parser):
# a PORT already in use is refused, a free one used, and with none the first free port of the list picked; a pid file left
# by a run that never stopped can name an unrelated process by now, which must survive, while a process the script did
# start is stopped; the model server's port is MODEL_PORT, or its old name KEV_PORT when that is unset (said once), and
# MODEL_PORT wins. Run by CI's Linux job (pwsh) and by hand; Windows' taskkill/CIM branches are not exercised here.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'demo.ps1'), [ref]$null, [ref]$null)
foreach ($name in 'Say', 'Warn', 'Get-ModelPort', 'Test-PortBusy', 'Select-WebPort', 'Stop-Tree', 'Test-Ours', 'Stop-All') {
  $fn = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true)
  if (-not $fn) { throw "demo.ps1 has no $name" }
  . ([scriptblock]::Create($fn.Extent.Text))
}
function Die([string]$m) { throw "DIE: $m" }   # demo.ps1's exits the process
$script:OnWindows = $IsWindows
$script:warnings = @(); function Warn([string]$m) { $script:warnings += $m }
function Fail([string]$m) { Write-Host "FAIL: $m"; exit 1 }
function Free-Port { $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0); $l.Start(); $p = $l.LocalEndpoint.Port; $l.Stop(); $p }

# the port picker
$busy = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0); $busy.Start(); $busyPort = $busy.LocalEndpoint.Port
try {
  $env:PORT = "$busyPort"
  try { $null = Select-WebPort; Fail "PORT=$busyPort (in use) was accepted" } catch { if ("$_" -notmatch "PORT=$busyPort is already in use") { Fail "unexpected: $_" } }
  # so is one in use on ::1 only: the browser's localhost can resolve to it
  $busy6 = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::IPv6Loopback, 0); $busy6.Start(); $busy6Port = $busy6.LocalEndpoint.Port
  try {
    $env:PORT = "$busy6Port"
    try { $null = Select-WebPort; Fail "PORT=$busy6Port (in use on ::1) was accepted" } catch { if ("$_" -notmatch "PORT=$busy6Port is already in use") { Fail "unexpected: $_" } }
  } finally { $busy6.Stop() }
  $free = Free-Port; $env:PORT = "$free"
  if ((Select-WebPort) -ne $free) { Fail "PORT=$free (free) was not used" }
  Remove-Item Env:PORT
  $picked = Select-WebPort
  if ((@(3001, 3011) + (3021..3030)) -notcontains $picked) { Fail "no PORT: $picked is not in the list" }
  if (Test-PortBusy $picked) { Fail "no PORT: picked $picked, which is in use" }
} finally { $busy.Stop() }

# the model server's port: MODEL_PORT, else the old KEV_PORT with a note, else 8009; MODEL_PORT wins; empty is unset
foreach ($n in 'MODEL_PORT', 'KEV_PORT') { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
$script:warnings = @()
if ((Get-ModelPort) -ne 8009 -or $script:warnings) { Fail "no port set: not 8009, or a note: $script:warnings" }
$env:KEV_PORT = '9101'
if ((Get-ModelPort) -ne 9101) { Fail 'KEV_PORT alone is not honoured' }
if (-not ($script:warnings -match 'KEV_PORT is the old name of MODEL_PORT')) { Fail 'KEV_PORT alone went unsaid' }
$script:warnings = @(); $env:MODEL_PORT = '9102'
if ((Get-ModelPort) -ne 9102 -or $script:warnings) { Fail "MODEL_PORT did not win over KEV_PORT, or a note: $script:warnings" }
$env:MODEL_PORT = ''
if ((Get-ModelPort) -ne 9101) { Fail 'an empty MODEL_PORT beat KEV_PORT' }
# and in demo.ps1 itself (a copy, so its .demo stays out of the checkout): --no-server names the port it looked at
$copy = Join-Path ([System.IO.Path]::GetTempPath()) ("d1a-ps1-port-" + [guid]::NewGuid()); New-Item -ItemType Directory -Force -Path $copy | Out-Null
try {
  Copy-Item (Join-Path $root 'demo.ps1') $copy
  $free = Free-Port; $busyPort2 = Free-Port
  foreach ($set in @(@{ KEV_PORT = "$free"; MODEL_PORT = '' }, @{ MODEL_PORT = "$free"; KEV_PORT = '' }, @{ MODEL_PORT = "$free"; KEV_PORT = "$busyPort2" })) {
    $env:KEV_PORT = $set.KEV_PORT; $env:MODEL_PORT = $set.MODEL_PORT
    $out = (& pwsh -NoProfile -File (Join-Path $copy 'demo.ps1') '--no-server' 2>&1 | Out-String)
    if ($out -notmatch "nothing answers on http://127\.0\.0\.1:$free/v1/models") { Fail "demo.ps1 with $($set | ConvertTo-Json -Compress): $out" }
  }
} finally { Remove-Item -Recurse -Force $copy; foreach ($n in 'MODEL_PORT', 'KEV_PORT') { Remove-Item "Env:$n" -ErrorAction SilentlyContinue } }
$script:warnings = @()

# --lmstudio=URL, as demo.sh takes it, both from a prompt and through pwsh -File (which splits it at the first colon): the
# conflict check runs right after parsing, and in LM Studio mode the banner names the URL
$demo = Join-Path $Root 'demo.ps1'
foreach ($out in @((& pwsh -NoProfile -File $demo '--lmstudio=http://127.0.0.1:1/' '--no-server' 2>&1 | Out-String),
                   (& pwsh -NoProfile -Command "& '$demo' --lmstudio=http://127.0.0.1:1/ --no-server" 2>&1 | Out-String))) {
  if ($out -notmatch 'do not go together') { Fail "--lmstudio=URL was not taken: $out" }
}

# the pid-file cleanup
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("d1a-ps1-" + [guid]::NewGuid()); $script:State = Join-Path $tmp 'state'
New-Item -ItemType Directory -Force -Path $State, (Join-Path $tmp 'node_modules/next/dist/bin') | Out-Null
Set-Content (Join-Path $tmp 'node_modules/next/dist/bin/next') 'while :; do sleep 1; done'
$stranger = Start-Process sleep -ArgumentList 300 -PassThru
$web = Start-Process bash -ArgumentList (Join-Path $tmp 'node_modules/next/dist/bin/next') -PassThru
try {
  Set-Content (Join-Path $State 'web.pid') $stranger.Id
  Stop-All *> $null
  if ($stranger.HasExited) { Fail "Stop-All killed an unrelated process that a stale web.pid named" }
  if (-not ($script:warnings -match "web: process $($stranger.Id) is not the one this script started")) { Fail "no warning for the stale pid" }
  Set-Content (Join-Path $State 'web.pid') $web.Id; Set-Content (Join-Path $State 'model-server.pid') 'not-a-pid'
  Stop-All *> $null
  if (-not $web.WaitForExit(10000)) { Fail "Stop-All left the web app it started running" }
  if ($stranger.HasExited) { Fail "the unrelated process died" }
  if (Get-ChildItem $State) { Fail "pid files left: $(Get-ChildItem $State -Name)" }
} finally { foreach ($p in $stranger, $web) { if (-not $p.HasExited) { $p.Kill() } }; Remove-Item -Recurse -Force $tmp }
Write-Host "demo.ps1 Select-WebPort, Get-ModelPort and Stop-All: OK under PowerShell $($PSVersionTable.PSVersion)"
