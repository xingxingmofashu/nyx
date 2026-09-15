import { builtinModules } from "node:module"
import { resolve } from "node:path"
import { defineConfig } from "vite"

/** Bare and `node:`-prefixed builtins, kept external to the Node bundle. */
const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]

/**
 * Bundle @nyx/server into a single CJS file runnable by plain Node.
 * Native/backend modules stay external: onnxruntime-node and sharp cannot be
 * bundled, and @huggingface/transformers is kept external so its node build
 * resolves onnxruntime-node from node_modules at runtime. Node builtins are
 * externalized too (a dependency like write-file-atomic imports bare `fs`).
 */
export default defineConfig({
  build: {
    outDir: "dist",
    lib: {
      entry: resolve(__dirname, "src/server.ts"),
      formats: ["cjs"],
      fileName: () => "server.cjs",
    },
    rollupOptions: {
      external: ["onnxruntime-node", "onnxruntime-common", "sharp", "@huggingface/transformers", ...nodeBuiltins],
    },
  },
})
