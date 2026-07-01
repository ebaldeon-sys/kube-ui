@echo off
setlocal

cd /d "%~dp0"

echo kubeui - starting development app
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not available in PATH.
  echo Install Node.js and run this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed or is not available in PATH.
  echo Install Node.js with npm first.
  echo.
  pause
  exit /b 1
)

node -e "const v=process.versions.node.split('.').map(Number); const ok=v[0]>22 || (v[0]===22 && (v[1]>12 || (v[1]===12 && v[2]>=0))); process.exit(ok?0:1)"
if errorlevel 1 (
  echo Node.js 22.12.0 or newer is required for Electron 42.
  echo Current Node:
  node --version
  echo.
  echo Install Node.js 22 LTS or newer, then run install-windows.bat again.
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
