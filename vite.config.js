import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

function copyMuseumStaticAssets() {
  return {
    name: "copy-museum-static-assets",
    closeBundle() {
      const museumOutDir = resolve(import.meta.dirname, "dist/online-museum");
      mkdirSync(museumOutDir, { recursive: true });

      for (const dir of ["data", "thumbs", "screenshots", "textures"]) {
        const source = resolve(import.meta.dirname, "online-museum", dir);
        if (!existsSync(source)) continue;
        cpSync(source, resolve(museumOutDir, dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  root: ".",
  base: "./",
  plugins: [vue(), copyMuseumStaticAssets()],
  server: {
    host: "127.0.0.1",
    port: 8765,
    strictPort: false,
    fs: {
      allow: [resolve(import.meta.dirname)],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "online-museum/assets",
    rollupOptions: {
      input: resolve(import.meta.dirname, "online-museum/index.html"),
    },
  },
});
