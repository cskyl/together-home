param()

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launchScript = Join-Path $projectRoot 'scripts\launch-host.ps1'
$stopScript = Join-Path $projectRoot 'scripts\stop-host.ps1'
$watchScript = Join-Path $projectRoot 'scripts\watch-host.ps1'
$runtimeDirectory = Join-Path $projectRoot 'runtime'
$powershellExecutable = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
$taskName = 'Together Home Host'
$taskDescription = "Together Home background host; project=$projectRoot"
$watchTaskName = 'Together Home Watchdog'
$watchTaskDescription = "Together Home host watchdog; project=$projectRoot"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentUser = $identity.Name
$commonArguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File '
$launchArguments = $commonArguments + '"' + $launchScript + '"'
$taskArguments = $launchArguments + ' -Supervise'
$stopArguments = $commonArguments + '"' + $stopScript + '"'
$watchArguments = $commonArguments + '"' + $watchScript + '"'

foreach ($requiredPath in @($launchScript, $stopScript, $watchScript, $powershellExecutable)) {
  if (!(Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Required host file was not found: $requiredPath"
  }
}

# Scheduled tasks may have a different PATH from this terminal. Store only
# executable locations, never credentials, in the ignored runtime directory.
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$settingsPath = Join-Path $runtimeDirectory 'host-settings.json'
$existingSettings = if (Test-Path -LiteralPath $settingsPath) { Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json } else { $null }
$hostSettings = @{}
foreach ($dependency in @(@{ key='nodePath'; command='node.exe' }, @{ key='ghPath'; command='gh.exe' })) {
  $savedPath = if ($existingSettings) { $existingSettings.($dependency.key) } else { $null }
  if ($savedPath -and (Test-Path -LiteralPath $savedPath -PathType Leaf)) {
    $hostSettings[$dependency.key] = [IO.Path]::GetFullPath($savedPath)
  } else {
    $resolved = Get-Command $dependency.command -CommandType Application -ErrorAction SilentlyContinue
    if (!$resolved) { throw "Required executable unavailable: $($dependency.command). Install it or set its absolute path in runtime/host-settings.json." }
    $hostSettings[$dependency.key] = $resolved.Source
  }
}
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'tools\cloudflared.exe') -PathType Leaf)) { throw 'Missing tools/cloudflared.exe.' }
[IO.File]::WriteAllText($settingsPath, ($hostSettings | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))

function Test-AccessDenied($Record) {
  $exception = $Record.Exception
  while ($null -ne $exception) {
    if ($exception -is [UnauthorizedAccessException] -or $exception.HResult -eq -2147024891) { return $true }
    if ($exception.PSObject.Properties['NativeErrorCode'] -and $exception.NativeErrorCode -eq 5) { return $true }
    $exception = $exception.InnerException
  }
  return $Record.FullyQualifiedErrorId -match '(^|[, :])(?:AccessDenied|UnauthorizedAccess|0x80070005)([, :]|$)'
}

function Assert-OwnedShortcut([string]$Path, [string]$ScriptPath) {
  if (!(Test-Path -LiteralPath $Path)) { return }
  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw "A folder already uses this shortcut path: $Path" }
  $shortcut = $null
  try {
    $shortcut = $shell.CreateShortcut($Path)
    $fileArgument = '(?i)(?:^|\s)-File\s+"' + [regex]::Escape($ScriptPath) + '"(?:\s|$)'
    if ($shortcut.TargetPath -ne $powershellExecutable -or $shortcut.Arguments -notmatch $fileArgument) {
      throw "An unrelated shortcut already uses this name. It was left unchanged: $Path"
    }
  } finally {
    if ($null -ne $shortcut) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut) }
  }
}

function Save-HostShortcut([string]$Path, [string]$Arguments, [string]$Description) {
  $shortcut = $null
  try {
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = $powershellExecutable
    $shortcut.Arguments = $Arguments
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.WindowStyle = 7
    $shortcut.Description = $Description
    $shortcut.IconLocation = "$powershellExecutable,0"
    $shortcut.Save()
  } finally {
    if ($null -ne $shortcut) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut) }
  }
}

$shell = $null
try {
  $shell = New-Object -ComObject WScript.Shell
  $desktopDirectory = [string]$shell.SpecialFolders.Item('Desktop')
  $startupDirectory = [string]$shell.SpecialFolders.Item('Startup')
  foreach ($folder in @($desktopDirectory, $startupDirectory)) {
    if ([string]::IsNullOrWhiteSpace($folder) -or !(Test-Path -LiteralPath $folder -PathType Container)) {
      throw 'The current user desktop or Startup folder could not be located.'
    }
  }
  $startShortcut = Join-Path $desktopDirectory 'Together Home Start.lnk'
  $stopShortcut = Join-Path $desktopDirectory 'Together Home Stop.lnk'
  $startupShortcut = Join-Path $startupDirectory 'Together Home Host.lnk'
  Assert-OwnedShortcut $startShortcut $launchScript
  Assert-OwnedShortcut $stopShortcut $stopScript
  Assert-OwnedShortcut $startupShortcut $launchScript

  $mechanism = 'scheduled-task'
  $fallbackReason = $null
  $watchdogInstalled = $false
  $watchdogUnavailableReason = $null
  try {
    # Refuse to replace an unrelated task, even if it happens to use our name.
    $existingTasks = @(Get-ScheduledTask -TaskPath '\' -ErrorAction Stop)
    $existingTask = $existingTasks | Where-Object { $_.TaskName -eq $taskName }
    if ($existingTask) {
      $ownedAction = @($existingTask.Actions | Where-Object {
        $_.Execute -eq $powershellExecutable -and $_.Arguments -eq $taskArguments
      })
      if ($existingTask.Description -ne $taskDescription -or $ownedAction.Count -ne 1 -or @($existingTask.Actions).Count -ne 1) {
        throw "An unrelated scheduled task already uses the name '$taskName'. It was left unchanged."
      }
    }
    $existingWatchTask = $existingTasks | Where-Object { $_.TaskName -eq $watchTaskName }
    if ($existingWatchTask -and ($existingWatchTask.Description -ne $watchTaskDescription -or @($existingWatchTask.Actions).Count -ne 1 -or $existingWatchTask.Actions[0].Execute -ne $powershellExecutable -or $existingWatchTask.Actions[0].Arguments -ne $watchArguments)) {
      throw "An unrelated scheduled task already uses the name '$watchTaskName'. It was left unchanged."
    }
    $action = New-ScheduledTaskAction -Execute $powershellExecutable -Argument $taskArguments -WorkingDirectory $projectRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
    $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 5 -RestartInterval ([TimeSpan]::FromMinutes(1))
    Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $taskDescription -Force -ErrorAction Stop | Out-Null
  } catch {
    if (!(Test-AccessDenied $_)) { throw }
    $mechanism = 'startup-shortcut'
    $fallbackReason = 'Task Scheduler denied access; installed a current-user Startup shortcut instead.'
  }

  if ($mechanism -eq 'scheduled-task') {
    try {
      $watchAction = New-ScheduledTaskAction -Execute $powershellExecutable -Argument $watchArguments -WorkingDirectory $projectRoot
      # Omitting RepetitionDuration repeats indefinitely, including future logons.
      $watchTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval ([TimeSpan]::FromMinutes(1))
      $watchSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes(1)) -MultipleInstances IgnoreNew
      Register-ScheduledTask -TaskName $watchTaskName -TaskPath '\' -Action $watchAction -Trigger $watchTrigger -Principal $principal -Settings $watchSettings -Description $watchTaskDescription -Force -ErrorAction Stop | Out-Null
      $watchdogInstalled = $true
    } catch {
      if (!(Test-AccessDenied $_)) { throw }
      $watchdogUnavailableReason = 'Task Scheduler denied watchdog registration; the primary sign-in task remains installed.'
    }
  }

  if ($mechanism -eq 'startup-shortcut') {
    Save-HostShortcut $startupShortcut $launchArguments 'Start Together Home in the background at sign-in.'
  } elseif (Test-Path -LiteralPath $startupShortcut) {
    # Ownership was checked above; do not leave two automatic launch entries.
    Remove-Item -LiteralPath $startupShortcut -Force
  }
  Save-HostShortcut $startShortcut ($launchArguments + ' -Open') 'Start Together Home in the background and open the website.'
  Save-HostShortcut $stopShortcut $stopArguments 'Stop the Together Home background host.'

  New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  $installInfo = [ordered]@{
    installedAt = [DateTimeOffset]::UtcNow.ToString('o')
    projectRoot = $projectRoot
    mechanism = $mechanism
    taskName = $(if ($mechanism -eq 'scheduled-task') { $taskName } else { $null })
    taskPath = $(if ($mechanism -eq 'scheduled-task') { '\' } else { $null })
    watchdogTaskName = $(if ($watchdogInstalled) { $watchTaskName } else { $null })
    watchdogUnavailableReason = $watchdogUnavailableReason
    startupShortcut = $(if ($mechanism -eq 'startup-shortcut') { $startupShortcut } else { $null })
    desktopStartShortcut = $startShortcut
    desktopStopShortcut = $stopShortcut
    fallbackReason = $fallbackReason
  }
  [IO.File]::WriteAllText((Join-Path $runtimeDirectory 'startup-install.json'), ($installInfo | ConvertTo-Json -Depth 3), [Text.UTF8Encoding]::new($false))
  Write-Output "Together Home automatic startup installed: $mechanism"
  if ($fallbackReason) { Write-Output $fallbackReason }
  if ($watchdogUnavailableReason) { Write-Warning $watchdogUnavailableReason }
  Write-Output "Start shortcut: $startShortcut"
  Write-Output "Stop shortcut: $stopShortcut"
  Write-Output 'The host will start at your next sign-in. Use the desktop start shortcut to start it now.'
} finally {
  if ($null -ne $shell) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell) }
  $identity.Dispose()
}
