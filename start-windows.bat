@echo off
setlocal

cd /d "%~dp0"

echo kubeui - starting development app
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed or is not available in PATH.
  echo Install Node.js with npm first.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Dependencies are missing.
  echo Run install-windows.bat first.
  echo.
  pause
  exit /b 1
)

call npm run dev
if errorlevel 1 (
  echo.
  echo Start failed.
  pause
  exit /b 1
)
