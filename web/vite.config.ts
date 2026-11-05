import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" : le site est servi depuis n'importe quel sous-chemin (GitHub Pages, Cloudflare Pages…).
export default defineConfig({
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: false },
});
