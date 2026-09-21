# Run in a hidden, dedicated PowerShell process. start-host.ps1 owns service
# health checks, process recovery and idempotent publication of the public URL.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeDirectory = Join-Path $projectRoot 'runtime'
$enabledPath = Join-Path $runtimeDirectory 'host-enabled'
$pidPath = Join-Path $runtimeDirectory 'supervisor.pid'
$statusPath = Join-Path $runtimeDirectory 'host-status.json'
$diagnosticPath = Join-Path $runtimeDirectory 'supervisor.diagnostic.log'
$endpointPath = Join-Path $runtimeDirectory 'endpoint.json'
$configPath = Join-Path $projectRoot 'public\cloud-config.json'
$startScript = Join-Path $PSScriptRoot 'start-host.ps1'
$supervisorProcessId = $PID
$utf8 = New-Object Text.UTF8Encoding($false)
$mutex = $null
$ownsMutex = $false
$powerRequestActive = $false
$lastHealthyAt = $null
$lastPublicUrl = $null
$lastError = $null
$supervisorExitCode = 0

function Test-HostingEnabled {
    return Test-Path -LiteralPath $enabledPath -PathType Leaf
}

function Get-PublicApiUrl {
    # Only include a public origin in the status file. Never copy configuration
    # contents, query strings, credentials or a helper's raw exception message.
    try {
        $sourcePath = if (Test-Path -LiteralPath $endpointPath -PathType Leaf) { $endpointPath } else { $configPath }
        if (!(Test-Path -LiteralPath $sourcePath -PathType Leaf)) { return $null }
        $config = Get-Content -LiteralPath $sourcePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $parsedUri = $null
        if (![Uri]::TryCreate([string]$config.apiUrl, [UriKind]::Absolute, [ref]$parsedUri)) { return $null }
        if ($parsedUri.Scheme -ne 'https' -or $parsedUri.UserInfo -or $parsedUri.Query -or $parsedUri.Fragment) { return $null }
        if ($parsedUri.Host -notmatch '^[a-z0-9-]+\.trycloudflare\.com$') { return $null }
        return $parsedUri.GetLeftPart([UriPartial]::Authority)
    } catch {
        return $null
    }
}

function Write-HostStatus([string]$State, [string]$Failure) {
    $status = [ordered]@{
        state = $State
        updatedAt = [DateTime]::UtcNow.ToString('o')
        lastHealthyAt = $lastHealthyAt
        publicUrl = $lastPublicUrl
        error = if ([string]::IsNullOrWhiteSpace($Failure)) { $null } else { $Failure }
    }
    $temporaryPath = "$statusPath.$supervisorProcessId.tmp"
    try {
        [IO.File]::WriteAllText($temporaryPath, ($status | ConvertTo-Json -Compress), $utf8)
        if (Test-Path -LiteralPath $statusPath -PathType Leaf) {
            # Windows PowerShell 5.1 coerces $null to an empty string for this
            # .NET overload, which is an invalid backup path. Pass a CLR null.
            [IO.File]::Replace($temporaryPath, $statusPath, [NullString]::Value)
        } else {
            [IO.File]::Move($temporaryPath, $statusPath)
        }
    } finally {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
            Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
        }
    }
}

function Write-SupervisorDiagnostic([string]$Operation, [Management.Automation.ErrorRecord]$Failure) {
    # Record useful failure metadata without storing command arguments, raw
    # exceptions, HTTP bodies or credentials. The helper owns detailed logs.
    try {
        $cause = $Failure.Exception.GetBaseException()
        $entry = [ordered]@{
            at = [DateTime]::UtcNow.ToString('o')
            operation = $Operation
            exceptionType = $cause.GetType().FullName
            hresult = $cause.HResult
            scriptLine = $Failure.InvocationInfo.ScriptLineNumber
        }
        [IO.File]::AppendAllText($diagnosticPath, (($entry | ConvertTo-Json -Compress) + [Environment]::NewLine), $utf8)
    } catch {
        Write-Warning 'Together Home could not write its supervisor diagnostic log.'
    }
}

function Wait-WhileHostingEnabled([int]$Seconds) {
    $remaining = $Seconds
    while ($remaining -gt 0 -and (Test-HostingEnabled)) {
        $slice = [Math]::Min(15, $remaining)
        Start-Sleep -Seconds $slice
        $remaining -= $slice
    }
}

try {
    if (!(Test-HostingEnabled)) { return }
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $repoKey = [BitConverter]::ToString($hasher.ComputeHash($utf8.GetBytes($projectRoot.TrimEnd('\').ToLowerInvariant()))).Replace('-', '')
    } finally {
        $hasher.Dispose()
    }
    # Global covers an interactive startup shortcut and a scheduled task in a
    # different Windows session. The full repository path separates checkouts.
    try {
        $mutex = New-Object Threading.Mutex($false, "Global\TogetherHome-Host-$repoKey")
    } catch [UnauthorizedAccessException] {
        # On a machine restricting global objects, startup shortcuts and the
        # interactive logon task still share the local Windows session.
        $mutex = New-Object Threading.Mutex($false, "Local\TogetherHome-Host-$repoKey")
    }
    try {
        $ownsMutex = $mutex.WaitOne(0, $false)
    } catch [Threading.AbandonedMutexException] {
        $ownsMutex = $true
    }
    if (!$ownsMutex -or !(Test-HostingEnabled)) { return }

    [IO.File]::WriteAllText($pidPath, [string]$supervisorProcessId, $utf8)
    $lastPublicUrl = Get-PublicApiUrl
    Write-HostStatus 'starting' $null

    if (-not ('TogetherHome.HostPower' -as [type])) {
        Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
namespace TogetherHome {
    public static class HostPower {
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint SetThreadExecutionState(uint flags);
        public static bool HoldSystemAwake() {
            return SetThreadExecutionState(0x80000001u) != 0;
        }
        public static void Release() {
            SetThreadExecutionState(0x80000000u);
        }
    }
}
'@
    }
    if (![TogetherHome.HostPower]::HoldSystemAwake()) {
        throw 'The host could not request prevention of idle system sleep.'
    }
    $powerRequestActive = $true
    # ES_DISPLAY_REQUIRED is deliberately absent: the display may turn off.
    # Manual sleep/shutdown remains possible; there are no power-plan changes.
    $retrySeconds = 15
    while (Test-HostingEnabled) {
        try {
            # The helper reads optional absolute executable paths from
            # runtime/host-settings.json. It must throw on recovery/publish
            # failure. The helper caches the last successful published URL in
            # runtime/published-api-url.txt and retries failed remote updates.
            & $startScript -Publish | Out-Null
            if (!(Test-HostingEnabled)) { break }
            $lastPublicUrl = Get-PublicApiUrl
            $lastHealthyAt = [DateTime]::UtcNow.ToString('o')
            $lastError = $null
            Write-HostStatus 'healthy' $null
            $retrySeconds = 15
            Wait-WhileHostingEnabled 15
        } catch {
            if (!(Test-HostingEnabled)) { break }
            Write-SupervisorDiagnostic 'health-recovery-or-publication' $_
            $lastPublicUrl = Get-PublicApiUrl
            $lastError = 'Host health check, recovery or publication failed. Retrying automatically; see the host logs.'
            try { Write-HostStatus 'recovering' $lastError } catch {
                Write-SupervisorDiagnostic 'write-recovering-status' $_
                Write-Warning 'Together Home could not update host-status.json.'
            }
            Write-Warning "Together Home host recovery failed; retrying in $retrySeconds seconds."
            Wait-WhileHostingEnabled $retrySeconds
            $retrySeconds = [Math]::Min(60, $retrySeconds * 2)
        }
    }
} catch {
    $supervisorExitCode = 1
    Write-SupervisorDiagnostic 'supervisor-start-or-run' $_
    $lastError = 'The host supervisor could not continue. Check the host installation and runtime folder, then start hosting again.'
    Write-Warning $lastError
} finally {
    try {
        if ($powerRequestActive) { [TogetherHome.HostPower]::Release() }
    } finally {
        try {
            if ($ownsMutex) {
                # Leave an explicit stopped status instead of a stale healthy
                # indicator. Delete only a PID file still owned by this run.
                try { Write-HostStatus 'stopped' $lastError } catch {
                    Write-SupervisorDiagnostic 'write-stopped-status' $_
                    Write-Warning 'Together Home could not write its stopped status.'
                }
                if (Test-Path -LiteralPath $pidPath -PathType Leaf) {
                    $recordedProcessId = [string](Get-Content -LiteralPath $pidPath -Raw -ErrorAction SilentlyContinue)
                    if ($recordedProcessId.Trim() -eq [string]$supervisorProcessId) {
                        Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        } finally {
            if ($mutex) {
                try {
                    if ($ownsMutex) { $mutex.ReleaseMutex() }
                } finally {
                    $mutex.Dispose()
                }
            }
        }
    }
}

if ($supervisorExitCode -ne 0) { exit $supervisorExitCode }
