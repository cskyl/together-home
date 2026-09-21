# Shared console-free process creation with child-owned log handles.
if (-not ('TogetherHome.BackgroundProcess' -as [type])) {
    $processSettingsPath = Join-Path $PSScriptRoot '..\runtime\host-settings.json'
    $processSettings = if (Test-Path -LiteralPath $processSettingsPath) { Get-Content -LiteralPath $processSettingsPath -Raw | ConvertFrom-Json } else { $null }
    $processLauncher = if ($processSettings) { $processSettings.launcherPath } else { $null }
    if (!$processLauncher -or !(Test-Path -LiteralPath $processLauncher)) { $processLauncher = & (Join-Path $PSScriptRoot 'build-host-launcher.ps1') }
    [void][Reflection.Assembly]::LoadFrom($processLauncher)
}
function Start-HostProcess {
    param([string]$FilePath, [string[]]$ArgumentList, [string]$WorkingDirectory, [string]$RedirectStandardOutput, [string]$RedirectStandardError)
    return [TogetherHome.BackgroundProcess]::Start($FilePath, ($ArgumentList -join ' '), $WorkingDirectory, $RedirectStandardOutput, $RedirectStandardError)
}
