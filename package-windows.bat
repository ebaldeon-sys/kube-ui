@echo off
setlocal

cd /d "%~dp0"

echo kubeui - packaging Windows executable
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

echo Node:
node --version
echo npm:
npm --version
echo.

if not exist "node_modules" (
  echo Dependencies are missing. Installing them now...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed.
    pause
    exit /b 1
  )
)

echo Building and packaging kubeui...
echo.
call npm run dist
if errorlevel 1 (
  echo.
  echo Packaging failed.
  pause
  exit /b 1
)

echo.
echo Packaging completed.
echo Check the release folder for the generated Windows executable.
echo.
if exist "release" start "" "release"
pause
