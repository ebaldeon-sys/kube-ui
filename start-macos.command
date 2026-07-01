#!/bin/zsh
set -e

SCRIPT_DIR="${0:a:h}"
cd "$SCRIPT_DIR"

echo "kubeui - starting development app"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed or is not available in PATH."
  echo "Install Node.js with npm first."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed or is not available in PATH."
  echo "Install Node.js and run this file again."
  exit 1
fi

if ! node -e 'const v=process.versions.node.split(".").map(Number); const ok=v[0]>22 || (v[0]===22 && (v[1]>12 || (v[1]===12 && v[2]>=0))); process.exit(ok?0:1)'; then
  echo "Node.js 22.12.0 or newer is required for Electron 42."
  echo "Current Node: $(node --version)"
  echo "Install Node.js 22 LTS or newer, then run install-macos.command again."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Dependencies are missing."
  echo "Run install-macos.command first."
  exit 1
fi

npm run dev
