param([switch]$Publish)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
New-Item -ItemType Directory -Path (Join-Path $projectRoot 'runtime'), (Join-Path $projectRoot 'data') -Force | Out-Null
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$tunnelExecutable = Join-Path $projectRoot 'tools\cloudflared.exe'
if (!(Test-Path -LiteralPath $tunnelExecutable)) { throw 'Download official cloudflared-windows-amd64.exe from github.com/cloudflare/cloudflared/releases into tools/cloudflared.exe first.' }
$health = $null
try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4180/health' -TimeoutSec 3 } catch {}
if ($health -and $health.service -ne 'together-home') { throw 'Port 4180 is already in use by another service.' }
if (!$health) {
  $apiProcess = Start-Process -FilePath $nodeExecutable -ArgumentList 'backend/server.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput 'runtime/api.out.log' -RedirectStandardError 'runtime/api.err.log' -PassThru
  $apiProcess.Id | Set-Content -LiteralPath 'runtime/api.pid'
  for ($attempt = 0; $attempt -lt 30; $attempt++) { Start-Sleep -Milliseconds 300; try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4180/health' -TimeoutSec 2; break } catch {} }
  if (!$health) { throw 'Backend did not start; see runtime/api.err.log.' }
}
$tunnelProcess = $null
if (Test-Path -LiteralPath 'runtime/tunnel.pid') {
  $taskProcessId = [int](Get-Content -LiteralPath 'runtime/tunnel.pid')
  $candidate = Get-Process -Id $taskProcessId -ErrorAction SilentlyContinue
  if ($candidate -and $candidate.Path -eq $tunnelExecutable) { $tunnelProcess = $candidate }
}
if (!$tunnelProcess) {
  $tunnelProcess = Start-Process -FilePath $tunnelExecutable -ArgumentList 'tunnel --url http://127.0.0.1:4180 --no-autoupdate --protocol http2' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput 'runtime/tunnel.out.log' -RedirectStandardError 'runtime/tunnel.err.log' -PassThru
  $tunnelProcess.Id | Set-Content -LiteralPath 'runtime/tunnel.pid'
}
$publicApi = $null
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  if (Test-Path -LiteralPath 'runtime/tunnel.err.log') { $logText = [string](Get-Content -LiteralPath 'runtime/tunnel.err.log' -Raw); $match = [regex]::Match($logText,'https://[a-z0-9-]+\.trycloudflare\.com'); if ($match.Success) { $publicApi=$match.Value; break } }
  Start-Sleep -Milliseconds 500
}
if (!$publicApi) { throw 'Tunnel URL was not available; see runtime/tunnel.err.log.' }
$config = @{ apiUrl = $publicApi } | ConvertTo-Json -Compress
[IO.File]::WriteAllText((Join-Path $projectRoot 'public\cloud-config.json'),$config,[Text.UTF8Encoding]::new($false))
Write-Output "Backend is running. Public API: $publicApi"
Write-Output 'Keep this computer online and awake. Data stays in data/home.sqlite.'
if ($Publish) {
  git add -- public/cloud-config.json
  git diff --cached --quiet -- public/cloud-config.json
  if ($LASTEXITCODE -ne 0) { git commit -m 'Update self-hosted API address' -- public/cloud-config.json; if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }; git push origin main; if ($LASTEXITCODE -ne 0) { throw 'Push failed' } }
}
