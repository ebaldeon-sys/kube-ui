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

if [ ! -d "node_modules" ]; then
  echo "Dependencies are missing."
  echo "Run install-macos.command first."
  exit 1
fi

npm run dev
