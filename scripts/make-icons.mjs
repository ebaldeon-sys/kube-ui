// Genera los iconos de la app (icns/ico) a partir de la imagen fuente.
// Uso: node scripts/make-icons.mjs
import png2icons from "png2icons";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "image/kubeuiimage.png");
const outDir = resolve(root, "build");

mkdirSync(outDir, { recursive: true });
const input = readFileSync(source);

// BILINEAR = buen balance calidad/velocidad; 0 = sin compresion PNG interna.
const icns = png2icons.createICNS(input, png2icons.BILINEAR, 0);
const ico = png2icons.createICO(input, png2icons.BILINEAR, 0, false);

if (!icns || !ico) {
  console.error("No se pudieron generar los iconos. Verifica que image/kubeuiimage.png sea un PNG valido.");
  process.exit(1);
}

writeFileSync(resolve(outDir, "icon.icns"), icns);
writeFileSync(resolve(outDir, "icon.ico"), ico);
console.log("Iconos generados: build/icon.icns, build/icon.ico");
