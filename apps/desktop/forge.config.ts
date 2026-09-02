import type { ForgeConfig } from "@electron-forge/shared-types"

/**
 * Electron Forge configuration.
 *
 * Build: `@electron-forge/plugin-vite` compiles main/preload/renderer.
 * Native modules: onnxruntime-node and sharp are N-API/`.node` binaries;
 * `plugin-auto-unpack-natives` unpacks them from the asar. Packaging under
 * bun's hoisted layout needs extra hooks (see packageAfterCopy below) — v1
 * targets `electron-forge start` (dev); `make`/`package` hooks land with the
 * packaging milestone.
 */
const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: "**/*.{node,dylib,dll}",
    },
    name: "Nyx",
    appBundleId: "com.nyx.desktop",
    // bun hoisted layout: apps/desktop/node_modules holds symlinks; keep prune
    // disabled until the packageAfterCopy hook materialises real modules.
    prune: false,
    ignore: (file) => {
      if (!file) return false
      if (file.startsWith("/.vite")) return false
      if (file === "/package.json") return false
      // Drop workspace symlinks and bun store leftovers; native deps are
      // copied by the packaging hook.
      if (file.startsWith("/node_modules")) {
        return (
          file.startsWith("/node_modules/@nyx") ||
          file.startsWith("/node_modules/.bun") ||
          file.startsWith("/node_modules/.bin")
        )
      }
      return true
    },
  },
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
    {
      name: "@electron-forge/plugin-vite",
      config: {
        build: [
          {
            entry: { main: "src/main/index.ts" },
            config: "vite.main.config.ts",
            target: "main",
          },
          {
            entry: { preload: "src/preload/index.ts" },
            config: "vite.main.config.ts",
            target: "preload",
          },
        ],
        renderer: [
          {
            name: "main_window",
            config: "vite.renderer.config.ts",
          },
        ],
      },
    },
  ],
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
      config: {},
    },
    {
      name: "@electron-forge/maker-dmg",
      config: {
        name: `nyx-desktop-mac-${process.arch}`,
      },
    },
  ],
}

export default config
