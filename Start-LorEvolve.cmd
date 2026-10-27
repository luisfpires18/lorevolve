@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-LorEvolve.ps1" %*
set "LOREVOLVE_EXIT=%ERRORLEVEL%"
if not "%LOREVOLVE_EXIT%"=="0" (
  echo.
  echo LorEvolve failed to start. See .lorevolve\logs for details.
  pause
)
endlocal & exit /b %LOREVOLVE_EXIT%
