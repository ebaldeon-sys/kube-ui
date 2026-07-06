import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Rutas relativas en el build: la app empaquetada carga index.html via
  // file:// (asar) y con base "/" los assets apuntarian a la raiz del disco.
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
