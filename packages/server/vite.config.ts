import { defineConfig } from "vite"
import { resolve } from "node:path"

/**
 * Bundle @nyx/server into a single CJS file runnable by plain Node.
 * Native/backend modules stay external: onnxruntime-node and sharp cannot be
 * bundled, and @huggingface/transformers is kept external so its node build
 * resolves onnxruntime-node from node_modules at runtime.
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
      external: ["onnxruntime-node", "onnxruntime-common", "sharp", "@huggingface/transformers", /^node:/],
    },
  },
})
