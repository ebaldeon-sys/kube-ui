#!/bin/zsh
set -e

SCRIPT_DIR="${0:a:h}"
cd "$SCRIPT_DIR"

echo "kubeui - installing dependencies"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed or is not available in PATH."
  echo "Install Node.js and run this file again."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed or is not available in PATH."
  echo "Install Node.js with npm and run this file again."
  exit 1
fi

echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo

npm install

echo
echo "Install completed."
echo "You can now run start-macos.command."
echo
read "unused?Press Enter to close..."
