$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($serviceName in @('tunnel','api')) {
  $pidPath = Join-Path $projectRoot "runtime\$serviceName.pid"
  if (!(Test-Path -LiteralPath $pidPath)) { continue }
  $taskProcessId = [int](Get-Content -LiteralPath $pidPath)
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$taskProcessId" -ErrorAction SilentlyContinue
  if (!$processInfo) { continue }
  $expected = if ($serviceName -eq 'tunnel') { $processInfo.ExecutablePath -eq (Join-Path $projectRoot 'tools\cloudflared.exe') } else { $processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine -match 'backend/server\.mjs' }
  if ($expected) { Stop-Process -Id $taskProcessId; Write-Output "Stopped Together Home $serviceName" }
}
