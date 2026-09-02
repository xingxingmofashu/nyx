import { defineConfig } from "vite"

/**
 * Vite config for the Electron main + preload processes (Forge `main` and
 * `preload` targets).
 *
 * Only native/backend modules are externalized: onnxruntime-node and sharp
 * cannot be bundled (native .node/.dylib), and @huggingface/transformers is
 * kept external so its node build resolves onnxruntime-node at runtime from
 * node_modules. Everything else (@nyx/config, @nyx/core, @nyx/llm — pure TS
 * workspace sources) is bundled into .vite/build.
 */
export default defineConfig({
  build: {
    rollupOptions: {
      external: ["electron", "onnxruntime-node", "onnxruntime-common", "sharp", "@huggingface/transformers"],
    },
  },
})
