#!/bin/zsh
# Empaqueta la app de escritorio para macOS (dmg + zip) con electron-builder.
set -euo pipefail

cd "$(dirname "$0")"

echo "kubeui - empaquetando aplicacion para macOS"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js no esta instalado o no esta en el PATH."
  echo "Instala Node.js y vuelve a ejecutar este script."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm no esta instalado o no esta en el PATH."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando dependencias..."
  npm install
fi

echo "Generando build de produccion..."
npm run build

echo "Empaquetando con electron-builder (--mac)..."
npx electron-builder --mac

echo
echo "Listo. Revisa la carpeta release/."
