param()
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $projectRoot 'runtime'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$sources = @((Join-Path $PSScriptRoot 'host-launcher.cs'), (Join-Path $PSScriptRoot 'host-process.cs'))
$sourceHashes = ($sources | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash }) -join ':'
$hasher = [Security.Cryptography.SHA256]::Create()
try { $version = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($sourceHashes))).Replace('-', '').ToLowerInvariant().Substring(0, 12) }
finally { $hasher.Dispose() }
$launcherPath = Join-Path $runtimeRoot "host-launcher-$version.exe"
if (!(Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
    $compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    if (!(Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
    if (!(Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework C# compiler is unavailable.' }
    $temporaryOutput = Join-Path $runtimeRoot "host-launcher-$version-$PID.exe"
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $compiler
    $info.Arguments = '/nologo /target:winexe /optimize+ /out:"' + $temporaryOutput + '" ' + (($sources | ForEach-Object { '"' + $_ + '"' }) -join ' ')
    $info.WorkingDirectory = $projectRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $compilerProcess = New-Object Diagnostics.Process
    $compilerProcess.StartInfo = $info
    try {
        [void]$compilerProcess.Start()
        $outputTask = $compilerProcess.StandardOutput.ReadToEndAsync()
        $errorTask = $compilerProcess.StandardError.ReadToEndAsync()
        if (!$compilerProcess.WaitForExit(30000)) { $compilerProcess.Kill(); throw 'Host launcher compilation timed out.' }
        $outputText = $outputTask.GetAwaiter().GetResult() + $errorTask.GetAwaiter().GetResult()
        if ($compilerProcess.ExitCode -ne 0) { throw "Host launcher compilation failed: $outputText" }
        if (!(Test-Path -LiteralPath $launcherPath)) { [IO.File]::Move($temporaryOutput, $launcherPath) }
    } finally {
        $compilerProcess.Dispose()
        if (Test-Path -LiteralPath $temporaryOutput) { Remove-Item -LiteralPath $temporaryOutput -Force }
    }
}
Write-Output $launcherPath
