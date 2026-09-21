param([switch]$Publish)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $projectRoot 'runtime'
New-Item -ItemType Directory -Path $runtimeRoot, (Join-Path $projectRoot 'data') -Force | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
$settingsPath = Join-Path $runtimeRoot 'host-settings.json'
$hostSettings = if (Test-Path -LiteralPath $settingsPath) { Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json } else { $null }
function Resolve-HostExecutable($setting, $command) {
  if ($setting -and (Test-Path -LiteralPath $setting)) { return [string]$setting }
  $found = Get-Command $command -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  throw "Required executable unavailable: $command. Run the host installer again."
}
function Read-ServiceHealth($url, $timeout = 3) {
  try { return Invoke-RestMethod -Uri ($url + '/health') -TimeoutSec $timeout } catch { return $null }
}
function Get-HostProcess($name, $executable, $argument) {
  $pidFile = Join-Path $runtimeRoot ($name + '.pid')
  if (!(Test-Path -LiteralPath $pidFile)) { return $null }
  $serviceId = 0
  if (![int]::TryParse(([string](Get-Content -LiteralPath $pidFile -Raw)).Trim(), [ref]$serviceId)) { return $null }
  $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$serviceId" -ErrorAction SilentlyContinue
  if ($candidate -and $candidate.ExecutablePath -eq $executable -and $candidate.CommandLine.Contains($argument)) { return $candidate }
  return $null
}
function Invoke-HostGithub($ghPath, $arguments) {
  $responseFile = Join-Path $runtimeRoot 'github-host-response.json'
  $ghProcess = Start-Process -FilePath $ghPath -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $responseFile -RedirectStandardError (Join-Path $runtimeRoot 'github-host-error.log') -PassThru
  $null = $ghProcess.Handle
  if (!$ghProcess.WaitForExit(30000)) { $ghProcess.Kill(); throw 'GitHub address update timed out; it will retry automatically.' }
  if ($ghProcess.ExitCode -ne 0) { throw 'GitHub address update failed; check GitHub sign-in and network connectivity.' }
  return Get-Content -LiteralPath $responseFile -Raw | ConvertFrom-Json
}
$identity = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant()))).Replace('-', '').Substring(0, 20)
$startMutex = [Threading.Mutex]::new($false, "Local\TogetherHomeStart-$identity")
$locked = $false
try {
  try { $locked = $startMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (!$locked) { throw 'Together Home is already being started; wait for the current attempt.' }
  $nodeExecutable = Resolve-HostExecutable $hostSettings.nodePath 'node.exe'
  $tunnelExecutable = Join-Path $projectRoot 'tools\cloudflared.exe'
  $apiScript = Join-Path $projectRoot 'backend\server.mjs'
  if (!(Test-Path -LiteralPath $tunnelExecutable)) { throw 'Cloudflare executable is missing: tools/cloudflared.exe' }
  $localApi = 'http://127.0.0.1:4180'
  $health = Read-ServiceHealth $localApi
  if ($health -and $health.service -ne 'together-home') { throw 'Port 4180 is in use by another service.' }
  if (!$health) {
    $existingApi = Get-HostProcess 'api' $nodeExecutable $apiScript
    if (!$existingApi) {
      $apiProcess = Start-Process -FilePath $nodeExecutable -ArgumentList ('"' + $apiScript + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'api.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'api.err.log') -PassThru
      [IO.File]::WriteAllText((Join-Path $runtimeRoot 'api.pid'), [string]$apiProcess.Id, $utf8)
    }
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
      Start-Sleep -Milliseconds 300
      $health = Read-ServiceHealth $localApi 1
      if ($health -and $health.service -eq 'together-home') { break }
    }
    if ($health -and $health.service -ne 'together-home') { throw 'Port 4180 is in use by another service.' }
    if (!$health -and $existingApi) {
      # A live process can be stuck. Recheck ownership after the full health
      # grace period, and never replace a PID that changed during that wait.
      $stalledApi = Get-HostProcess 'api' $nodeExecutable $apiScript
      $exactScriptArgument = '(?:^|\s)(?:"' + [regex]::Escape($apiScript) + '"|' + [regex]::Escape($apiScript) + ')(?=\s|$)'
      if ($stalledApi -and $stalledApi.ProcessId -eq $existingApi.ProcessId -and $stalledApi.CommandLine -match $exactScriptArgument) {
        $health = Read-ServiceHealth $localApi 1
        if ($health -and $health.service -ne 'together-home') { throw 'Port 4180 is in use by another service.' }
        if (!$health) {
          $stalledProcess = Get-Process -Id $stalledApi.ProcessId -ErrorAction Stop
          $null = $stalledProcess.Handle
          Stop-Process -InputObject $stalledProcess -Force -ErrorAction Stop
          if (!$stalledProcess.WaitForExit(5000)) { throw 'The unresponsive backend did not exit; recovery will retry.' }
          $apiProcess = Start-Process -FilePath $nodeExecutable -ArgumentList ('"' + $apiScript + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'api.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'api.err.log') -PassThru
          [IO.File]::WriteAllText((Join-Path $runtimeRoot 'api.pid'), [string]$apiProcess.Id, $utf8)
          for ($attempt = 0; $attempt -lt 15; $attempt++) {
            Start-Sleep -Milliseconds 300
            $health = Read-ServiceHealth $localApi 1
            if ($health -and $health.service -eq 'together-home') { break }
          }
        }
      }
    }
    if (!$health -or $health.service -ne 'together-home') { throw 'Backend is not responding; see runtime/api.err.log.' }
  }
  $tunnelProcess = Get-HostProcess 'tunnel' $tunnelExecutable '--url http://127.0.0.1:4180'
  if (!$tunnelProcess) {
    [IO.File]::WriteAllText((Join-Path $runtimeRoot 'tunnel.err.log'), '', $utf8)
    $tunnelProcess = Start-Process -FilePath $tunnelExecutable -ArgumentList 'tunnel --url http://127.0.0.1:4180 --no-autoupdate --protocol http2' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'tunnel.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'tunnel.err.log') -PassThru
    [IO.File]::WriteAllText((Join-Path $runtimeRoot 'tunnel.pid'), [string]$tunnelProcess.Id, $utf8)
  }
  $publicApi = $null
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $logText = [string](Get-Content -LiteralPath (Join-Path $runtimeRoot 'tunnel.err.log') -Raw -ErrorAction SilentlyContinue)
    $matches = [regex]::Matches($logText, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($matches.Count) { $publicApi = $matches[$matches.Count - 1].Value; break }
    Start-Sleep -Milliseconds 500
  }
  if (!$publicApi) { throw 'Tunnel address is not ready; see runtime/tunnel.err.log.' }
  $config = @{ apiUrl = $publicApi } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText((Join-Path $runtimeRoot 'endpoint.json'), $config, $utf8)
  $publicHealth = Read-ServiceHealth $publicApi 10
  if (!$publicHealth -or $publicHealth.service -ne 'together-home') { throw 'Public connection is not ready; the background host will retry.' }
  if ($Publish) {
    $publishedFile = Join-Path $runtimeRoot 'published-api-url.txt'
    $published = if (Test-Path -LiteralPath $publishedFile) { ([string](Get-Content -LiteralPath $publishedFile -Raw)).Trim() } else { '' }
    if ($published -ne $publicApi) {
      $ghExecutable = Resolve-HostExecutable $hostSettings.ghPath 'gh.exe'
      $env:GH_PROMPT_DISABLED = '1'
      $endpoint = 'repos/cskyl/together-home/contents/public/cloud-config.json'
      $remoteFile = Invoke-HostGithub $ghExecutable @('api', $endpoint, '--method', 'GET', '-f', 'ref=main')
      $remoteConfig = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($remoteFile.content)) | ConvertFrom-Json
      if ($remoteConfig.apiUrl -ne $publicApi) {
        $requestFile = Join-Path $runtimeRoot 'github-host-request.json'
        $body = @{ message = 'Update automatic host connection address'; branch = 'main'; sha = $remoteFile.sha; content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($config)) } | ConvertTo-Json -Compress
        [IO.File]::WriteAllText($requestFile, $body, $utf8)
        $updated = Invoke-HostGithub $ghExecutable @('api', $endpoint, '--method', 'PUT', '--input', ('"' + $requestFile + '"'))
        if (!$updated.commit.sha) { throw 'GitHub did not confirm the address update; it will retry.' }
      }
      [IO.File]::WriteAllText($publishedFile, $publicApi, $utf8)
    }
  } else {
    [IO.File]::WriteAllText((Join-Path $projectRoot 'public\cloud-config.json'), $config, $utf8)
  }
  Write-Output "Together Home is online: $publicApi"
} finally {
  if ($locked) { $startMutex.ReleaseMutex() }
  $startMutex.Dispose()
}
