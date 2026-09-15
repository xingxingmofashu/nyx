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
 * node_modules. Node builtins are externalized too (e.g. write-file-atomic
 * imports bare `fs`). Everything else (@nyx/config, @nyx/llm — pure TS
 * workspace sources) is bundled into .vite/build.
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
