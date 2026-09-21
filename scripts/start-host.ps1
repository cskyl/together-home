param([switch]$Publish)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'host-service.ps1') -Publish:$Publish
