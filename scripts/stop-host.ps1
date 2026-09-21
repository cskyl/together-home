$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $projectRoot 'runtime'
$enabledPath = Join-Path $runtimeRoot 'host-enabled'
if (Test-Path -LiteralPath $enabledPath) { Remove-Item -LiteralPath $enabledPath -Force }
try {
  $task = Get-ScheduledTask -TaskName 'Together Home Host' -ErrorAction SilentlyContinue
  if ($task -and ($task.Description -eq "Together Home background host; project=$projectRoot")) { Stop-ScheduledTask -InputObject $task -ErrorAction SilentlyContinue }
} catch {}
foreach ($serviceName in @('supervisor','tunnel','api')) {
  $pidPath = Join-Path $runtimeRoot "$serviceName.pid"
  if (!(Test-Path -LiteralPath $pidPath)) { continue }
  $hostProcessId = 0
  if (![int]::TryParse(([string](Get-Content -LiteralPath $pidPath -Raw)).Trim(), [ref]$hostProcessId)) { continue }
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$hostProcessId" -ErrorAction SilentlyContinue
  if ($processInfo) {
    $expected = switch ($serviceName) {
      'supervisor' { $processInfo.Name -eq 'powershell.exe' -and ($processInfo.CommandLine.Contains((Join-Path $PSScriptRoot 'host-supervisor.ps1')) -or $processInfo.CommandLine.Contains((Join-Path $PSScriptRoot 'launch-host.ps1'))) }
      'tunnel' { $processInfo.ExecutablePath -eq (Join-Path $projectRoot 'tools\cloudflared.exe') -and $processInfo.CommandLine.Contains('--url http://127.0.0.1:4180') }
      'api' { $processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine.Contains((Join-Path $projectRoot 'backend\server.mjs')) }
    }
    if ($expected) { Stop-Process -Id $hostProcessId -ErrorAction SilentlyContinue; Write-Output "Stopped Together Home $serviceName" }
  }
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $runtimeRoot) {
  $status = @{ state='stopped'; updatedAt=[DateTime]::UtcNow.ToString('o'); error=$null } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText((Join-Path $runtimeRoot 'host-status.json'), $status, [Text.UTF8Encoding]::new($false))
}
Write-Output 'Hosting stopped. Saved data is unchanged. Automatic startup remains enabled for your next sign-in.'
