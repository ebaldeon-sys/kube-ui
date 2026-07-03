#!/bin/zsh
# Compila el ejecutable PORTABLE de Windows (.exe) SIN FIRMA desde macOS/Linux
# usando la imagen oficial de electron-builder con Wine (via Docker). No requiere
# instalar Wine en el equipo. El resultado queda en release/.
#
# Solo se genera el target "portable" (un unico .exe autocontenido, ideal para
# compartir). El instalador NSIS NO se puede construir aqui: requiere que Wine
# ejecute un stub y eso falla bajo la emulacion qemu de Apple Silicon. Para
# generar el instalador NSIS hay que compilar en Windows real o en CI.
#
# Uso:  ./package-windows-docker.sh
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker no esta instalado. Instala Docker Desktop y vuelve a intentarlo."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker no esta corriendo. Abre Docker Desktop y vuelve a intentarlo."
  exit 1
fi

# Regenera los iconos por si cambio la imagen fuente (build/icon.ico, etc.).
if [ -f image/kubeuiimage.png ]; then
  node scripts/make-icons.mjs || true
fi

IMAGE="electronuserland/builder:wine"
echo "Compilando el .exe de Windows con Docker ($IMAGE)."
echo "La primera vez descarga la imagen (~2 GB) y en Apple Silicon corre emulada (mas lenta)."
echo

# --platform linux/amd64: la imagen es amd64; en Apple Silicon se emula.
# Volumen nombrado para node_modules: el contenedor hace su propio npm ci
# (binarios de Linux), sin pisar el node_modules de macOS del host.
docker run --rm \
  --platform linux/amd64 \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  -v "$PWD":/project \
  -v kubeui-wine-node-modules:/project/node_modules \
  "$IMAGE" \
  /bin/bash -c "npm ci && npm run build && npx electron-builder --win portable --publish never"

echo
echo "Listo. Revisa la carpeta release/:"
ls -1 release/*.exe 2>/dev/null || echo "  (no se encontraron .exe; revisa la salida de arriba)"
