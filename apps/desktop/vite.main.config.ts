import { builtinModules } from "node:module"
import { defineConfig } from "vite"

/** Bare and `node:`-prefixed builtins, kept external to the Electron main build. */
const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]

/**
 * Vite config for the Electron main + preload processes (Forge `main` and
 * `preload` targets).
 *
 * Only native/backend modules are externalized: onnxruntime-node and sharp
 * cannot be bundled (native .node/.dylib), and @huggingface/transformers is
 * kept external so its node build resolves onnxruntime-node at runtime from
 * node_modules. Node builtins are externalized too (bare and `node:`-prefixed).
 * Everything else (the desktop's own pure TS; the desktop type-only imports the
 * server wire schema) is bundled into .vite/build.
 */
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "electron",
        "onnxruntime-node",
        "onnxruntime-common",
        "sharp",
        "@huggingface/transformers",
        ...nodeBuiltins,
      ],
    },
  },
})
