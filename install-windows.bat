@echo off
setlocal

cd /d "%~dp0"

echo kubeui - installing dependencies
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
  echo Install Node.js with npm and run this file again.
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
  echo Install Node.js 22 LTS or newer, then run this file again.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node --version') do set NODE_VERSION=%%v
for /f "delims=" %%v in ('npm --version') do set NPM_VERSION=%%v

echo Node: %NODE_VERSION%
echo npm: %NPM_VERSION%
echo.

call npm install
if errorlevel 1 (
  echo.
  echo Install failed.
  pause
  exit /b 1
)

echo.
echo Install completed.
echo You can now run start-windows.bat.
echo.
pause
