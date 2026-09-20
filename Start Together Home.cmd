@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -File "%~dp0scripts\start-host.ps1" -Publish
pause
