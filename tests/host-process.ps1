# Windows-only, isolated native process tests. This never launches real hosting
# scripts, changes scheduled tasks, or reads/writes the shared database.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcherPath = [string](& (Join-Path $projectRoot 'scripts\build-host-launcher.ps1'))
$assembly = [Reflection.Assembly]::LoadFrom($launcherPath)
$backgroundProcessType = $assembly.GetType('TogetherHome.BackgroundProcess', $true)
$probeRoot = Join-Path $projectRoot ('runtime\host-process-test-' + [Guid]::NewGuid().ToString('N'))
$probeRuntime = Join-Path $probeRoot 'runtime'
$probeScripts = Join-Path $probeRoot 'scripts'
New-Item -ItemType Directory -Path $probeRoot, $probeRuntime, $probeScripts | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler -PathType Leaf)) {
    $compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}

function Assert-Probe([bool]$Condition, [string]$Message) {
    if (!$Condition) { throw $Message }
}

function Start-ProbeChild([string]$Executable, [string]$Arguments, [string]$LogName) {
    $outputPath = Join-Path $probeRoot ($LogName + '.out.log')
    $errorPath = Join-Path $probeRoot ($LogName + '.err.log')
    return $backgroundProcessType::Start($Executable, $Arguments, $probeRoot, $outputPath, $errorPath)
}

function Close-ProbeChild($Child) {
    if ($null -eq $Child) { return }
    try {
        # The handle belongs to a process created by this test. Never look up
        # an unrelated service by a PID, name, port, or command-line fragment.
        if (!$Child.WaitForExit(0)) { $Child.Kill(); [void]$Child.WaitForExit(5000) }
    } finally {
        $Child.Dispose()
    }
}

function Read-ProbeLog([string]$Name) {
    # The disposed-parent case reads while the child still owns a writer.
    # File.ReadAllText uses incompatible sharing for that live-log check.
    $stream = [IO.File]::Open((Join-Path $probeRoot $Name), [IO.FileMode]::Open,
        [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::UTF8, $true)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

# IMAGE_OPTIONAL_HEADER.Subsystem is at offset 68 for both PE32 and PE32+.
$pe = [IO.File]::ReadAllBytes($launcherPath)
Assert-Probe ($pe.Length -gt 128) 'The launcher is not a usable PE executable.'
$peOffset = [BitConverter]::ToInt32($pe, 0x3c)
Assert-Probe ($peOffset -ge 0 -and $peOffset + 94 -le $pe.Length) 'Invalid PE header offset.'
Assert-Probe ([BitConverter]::ToUInt32($pe, $peOffset) -eq 0x00004550) 'PE signature missing.'
Assert-Probe ([BitConverter]::ToUInt16($pe, $peOffset + 24 + 68) -eq 2) 'The launcher must use the Windows GUI subsystem (2).'
Write-Output 'PASS: launcher PE subsystem is Windows GUI.'

$probeSource = @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class TogetherHomeProcessProbe {
    [DllImport("kernel32.dll")] private static extern IntPtr GetConsoleWindow();
    public static bool HasConsole() { return GetConsoleWindow() != IntPtr.Zero; }
    public static int Main(string[] args) {
        Console.WriteLine("console=" + (HasConsole() ? "present" : "none"));
        Console.WriteLine("stdout=ok");
        Console.Error.WriteLine("stderr=ok");
        int delay = args.Length == 0 ? 0 : Int32.Parse(args[0]);
        if (delay > 0) Thread.Sleep(delay);
        Console.WriteLine("finished=ok");
        return 23;
    }
}
'@
$probeSourcePath = Join-Path $probeRoot 'probe.cs'
$probeExecutable = Join-Path $probeRoot 'probe.exe'
[IO.File]::WriteAllText($probeSourcePath, $probeSource, $utf8)
$compileArguments = '/nologo /target:exe /langversion:5 /out:"' + $probeExecutable + '" "' + $probeSourcePath + '"'
$compilerChild = Start-ProbeChild $compiler $compileArguments 'compiler'
try {
    Assert-Probe ($compilerChild.WaitForExit(30000)) 'Probe compilation timed out.'
    Assert-Probe ($compilerChild.ExitCode -eq 0) ('C#5 probe compilation failed: ' + (Read-ProbeLog 'compiler.out.log') + (Read-ProbeLog 'compiler.err.log'))
} finally {
    Close-ProbeChild $compilerChild
}

$child = Start-ProbeChild $probeExecutable '800' 'normal'
try {
    Assert-Probe ($child.Id -gt 0 -and $child.Handle -ne [IntPtr]::Zero) 'Child identity/handle missing.'
    Assert-Probe (!$child.WaitForExit(0)) 'Immediate wait must time out for the delayed probe.'
    $prematureExitCodeRejected = $false
    # Invoke the accessor explicitly: PS5's property adapter can turn a getter
    # exception into $null instead of propagating it to this catch block.
    try { $null = $child.get_ExitCode() } catch { $prematureExitCodeRejected = $true }
    Assert-Probe $prematureExitCodeRejected 'ExitCode must reject a process that has not finished.'
    Assert-Probe ($child.WaitForExit(5000)) 'The probe did not finish.'
    Assert-Probe ($child.WaitForExit(-1)) 'Infinite wait failed for an already completed child.'
    Assert-Probe ($child.ExitCode -eq 23) 'The native process exit code changed.'
    $stdout = Read-ProbeLog 'normal.out.log'
    $stderr = Read-ProbeLog 'normal.err.log'
    Assert-Probe ($stdout -match 'console=none') 'A console was allocated for the background probe.'
    Assert-Probe ($stdout -match 'stdout=ok' -and $stdout -match 'finished=ok') 'Stdout was lost.'
    Assert-Probe ($stderr -match 'stderr=ok') 'Stderr was lost.'
    Write-Output 'PASS: no child console, separate stdout/stderr, timeout, wait and nonzero exit code.'
} finally {
    Close-ProbeChild $child
}

# Close the parent process handle while the child is still alive. Its direct
# file handles must remain usable without a reader or pump in the parent.
$disposedChild = Start-ProbeChild $probeExecutable '800' 'disposed'
$disposedChild.Dispose()
$deadline = [Diagnostics.Stopwatch]::StartNew()
do {
    $disposedOutput = Read-ProbeLog 'disposed.out.log'
    if ($disposedOutput -match 'finished=ok') { break }
    Start-Sleep -Milliseconds 100
} while ($deadline.ElapsedMilliseconds -lt 5000)
Assert-Probe ($disposedOutput -match 'finished=ok') 'Dispose terminated the child or lost its later output.'
Assert-Probe ((Read-ProbeLog 'disposed.err.log') -match 'stderr=ok') 'Dispose lost stderr.'
Write-Output 'PASS: Dispose releases only the parent handle; child and file logging continue.'

$killChild = Start-ProbeChild $probeExecutable '10000' 'killed'
try {
    $killChild.Kill()
    Assert-Probe ($killChild.WaitForExit(5000)) 'Kill did not stop the test-owned probe.'
    Assert-Probe ($killChild.ExitCode -eq 1) 'Kill exit code was not preserved.'
    $killChild.Kill() # already exited: must be harmless
    Write-Output 'PASS: Kill uses the owned process handle and is harmless after exit.'
} finally {
    Close-ProbeChild $killChild
}

# Exercise the actual GUI launcher's exit-code forwarding in an isolated tree.
# Its relative scripts path resolves only to this harmless test stub.
$isolatedLauncher = Join-Path $probeRuntime ([IO.Path]::GetFileName($launcherPath))
Copy-Item -LiteralPath $launcherPath -Destination $isolatedLauncher
$escapedProbePath = $probeExecutable.Replace("'", "''")
$stub = @'
param([switch]$Supervise)
$ErrorActionPreference = 'Stop'
[void][Reflection.Assembly]::LoadFrom('__PROBE_PATH__')
Write-Output ('relay-console=' + [TogetherHomeProcessProbe]::HasConsole())
Write-Output 'relay-stdout=ok'
[Console]::Error.WriteLine('relay-stderr=ok')
exit 37
'@
[IO.File]::WriteAllText((Join-Path $probeScripts 'launch-host.ps1'), $stub.Replace('__PROBE_PATH__', $escapedProbePath), $utf8)
$relay = Start-ProbeChild $isolatedLauncher 'supervise' 'relay-parent'
try {
    Assert-Probe ($relay.WaitForExit(15000)) 'The isolated launcher did not finish.'
    Assert-Probe ($relay.ExitCode -eq 37) 'The GUI launcher did not forward the PowerShell exit code.'
    $relayStdout = [IO.File]::ReadAllText((Join-Path $probeRuntime 'launcher-supervise.out.log'))
    $relayStderr = [IO.File]::ReadAllText((Join-Path $probeRuntime 'launcher-supervise.err.log'))
    Assert-Probe ($relayStdout -match 'relay-console=False') 'The launcher allocated a PowerShell console.'
    Assert-Probe ($relayStdout -match 'relay-stdout=ok' -and $relayStderr -match 'relay-stderr=ok') 'The launcher lost the stub output.'
    Write-Output 'PASS: actual GUI launcher forwards exit code 37 with console-free PowerShell and intact logs.'
} finally {
    Close-ProbeChild $relay
}

Write-Output 'HOST PROCESS TESTS PASSED. No live hosting processes or scheduled tasks were changed.'
Write-Output ('Isolated test artifacts: ' + $probeRoot)
