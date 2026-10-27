@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Stop-LorEvolve.ps1" %*
endlocal & exit /b %ERRORLEVEL%
