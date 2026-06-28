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

for /f "delims=" %%v in ('node --version') do set NODE_VERSION=%%v
for /f "delims=" %%v in ('npm --version') do set NPM_VERSION=%%v

echo Node: %NODE_VERSION%
echo npm: %NPM_VERSION%
echo.

npm install
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
