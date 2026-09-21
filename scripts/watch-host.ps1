param()

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $projectRoot 'runtime'
$enabledPath = Join-Path $runtimeRoot 'host-enabled'
if (!(Test-Path -LiteralPath $enabledPath -PathType Leaf)) { return }

$powershellExecutable = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
$launchScript = Join-Path $PSScriptRoot 'launch-host.ps1'
$supervisorScript = Join-Path $PSScriptRoot 'host-supervisor.ps1'
$expectedArguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launchScript + '" -Supervise'
$task = Get-ScheduledTask -TaskPath '\' -TaskName 'Together Home Host' -ErrorAction SilentlyContinue
if (!$task -or $task.Description -ne "Together Home background host; project=$projectRoot") { return }
if (@($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -ne $powershellExecutable -or $task.Actions[0].Arguments -ne $expectedArguments) { return }

# A manually launched supervisor also counts. Never rely on a PID alone:
# Windows may have reused it for another process since the last run.
$pidPath = Join-Path $runtimeRoot 'supervisor.pid'
if (Test-Path -LiteralPath $pidPath -PathType Leaf) {
  $supervisorId = 0
  if ([int]::TryParse(([string](Get-Content -LiteralPath $pidPath -Raw)).Trim(), [ref]$supervisorId) -and $supervisorId -gt 0) {
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$supervisorId" -ErrorAction Stop
    if ($candidate -and $candidate.ExecutablePath -eq $powershellExecutable) {
      $scriptArgument = '(?i)(?:^|\s)-File\s+"(?:' + [regex]::Escape($supervisorScript) + '|' + [regex]::Escape($launchScript) + ')"(?:\s|$)'
      if ($candidate.CommandLine -match $scriptArgument) { return }
    }
  }
}

# Running/queued tasks may still be acquiring their mutex or writing the PID.
# Do not interrupt them. The next minute's check will observe their outcome.
if ($task.State -eq 'Running' -or $task.State -eq 'Queued' -or $task.State -eq 'Disabled') { return }
if (!(Test-Path -LiteralPath $enabledPath -PathType Leaf)) { return }
Start-ScheduledTask -InputObject $task -ErrorAction Stop
