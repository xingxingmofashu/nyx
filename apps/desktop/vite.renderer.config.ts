import { resolve } from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

/**
 * Vite config for the renderer process (Forge `renderer` target).
 *
 * The Vite root is pinned to src/renderer; base "./" makes the file://-loaded
 * index.html find its assets. preserveSymlinks is disabled so the bun-hoisted
 * workspace packages (@nyx/*) dedupe like plain vite. outDir is absolute
 * because Forge resolves it against the Vite root.
 */
export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: resolve(__dirname, ".vite/renderer/main_window"),
  },
  resolve: {
    preserveSymlinks: false,
  },
})
