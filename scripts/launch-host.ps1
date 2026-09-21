param([switch]$Open, [switch]$Supervise)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $projectRoot 'runtime'
$supervisorScript = Join-Path $PSScriptRoot 'host-supervisor.ps1'
$powershellExecutable = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $runtimeRoot 'host-enabled'), 'enabled', [Text.UTF8Encoding]::new($false))
if ($Supervise) { & $supervisorScript; return }
$identity = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant()))).Replace('-', '').Substring(0, 20)
$launchMutex = [Threading.Mutex]::new($false, "Local\TogetherHomeLaunch-$identity")
$locked = $false
try {
  try { $locked = $launchMutex.WaitOne(5000) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (!$locked) { throw 'Another Together Home launch is still in progress.' }
  $running = $null
  $pidFile = Join-Path $runtimeRoot 'supervisor.pid'
  if (Test-Path -LiteralPath $pidFile) {
    $hostProcessId = 0
    if ([int]::TryParse(([string](Get-Content -LiteralPath $pidFile -Raw)).Trim(), [ref]$hostProcessId)) {
      $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$hostProcessId" -ErrorAction SilentlyContinue
      if ($candidate -and $candidate.ExecutablePath -eq $powershellExecutable -and ($candidate.CommandLine.Contains($supervisorScript) -or $candidate.CommandLine.Contains((Join-Path $PSScriptRoot 'launch-host.ps1')))) { $running = $candidate }
    }
  }
  if (!$running) {
    $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $supervisorScript + '"'
    Start-Process -FilePath $powershellExecutable -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'supervisor.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'supervisor.err.log') | Out-Null
    # Only the supervisor that acquires the global mutex writes supervisor.pid.
    # A concurrent logon task may already own it when this child starts.
  }
} finally {
  if ($locked) { $launchMutex.ReleaseMutex() }
  $launchMutex.Dispose()
}
if ($Open) { Start-Process 'https://cskyl.github.io/together-home/' }
Write-Output 'Together Home is starting in the background. Status: runtime/host-status.json'
