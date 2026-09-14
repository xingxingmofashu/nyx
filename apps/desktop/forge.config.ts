import type { ForgeConfig } from "@electron-forge/shared-types"
import { spawn } from "node:child_process"
import { cp, mkdir, readFile, readdir, realpath, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
/**
 * Electron Forge configuration.
 *
 * Build: `@electron-forge/plugin-vite` compiles main/preload/renderer (see
 * vite.main.config.ts + vite.renderer.config.ts). The Vite bundles inline all
 * pure-JS dependencies (@nyx/*, react, ...); only `electron` + node builtins
 * are required at runtime, so the packaged asar needs no node_modules.
 *
 * Inference server: `@nyx/server` runs in a separate plain-`node` child
 * (onnxruntime-node crashes inside Electron). That child cannot read the asar,
 * so `packageAfterCopy` stages the server bundle (`server.cjs`) and its full
 * native/runtime closure into `Resources/runtime/` as real files — the layout
 * `NyxServerProcess` resolves in production.
 *
 * Bun layout: packages live in the root `node_modules/.bun/<store>` store and
 * `apps/desktop/node_modules` holds only symlinks (asar rejects out-of-package
 * links). We keep `prune: false` and never ship those symlinks; the closure is
 * dereferenced from the store when copying, then pruned to the current
 * platform/arch (see `pruneRuntime`): only the host's onnxruntime-node binary,
 * the node-only transformers build, and current-platform sharp libs are kept.
 */
const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "Nyx",
    appBundleId: "com.nyx.desktop",
    // Reuse the cached Electron zip instead of fetching its checksum from
    // GitHub (which times out on restricted networks).
    download: {
      unsafelyDisableChecksums: true,
    },
    // bun hoisted layout: apps/desktop/node_modules holds symlinks; keep prune
    // disabled until the packageAfterCopy hook materialises real modules.
    prune: false,
    // The asar only needs the Vite bundles + manifest; every node_modules
    // entry is a bun store symlink we must not ship (asar cannot follow
    // out-of-package links). The server runtime closure is copied to
    // Resources/runtime by packageAfterCopy, outside the asar.
    ignore: (file) => {
      if (!file) return false
      if (file.startsWith("/.vite")) return false
      if (file === "/package.json") return false
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
  hooks: {
    /**
     * Stage the inference-server runtime next to the packaged app:
     *
     *   <app>.app/Contents/Resources/runtime/
     *     server.cjs                (@nyx/server vite bundle)
     *     node_modules/…            dereferenced transformers + native closure
     *
     * A child spawned by NyxServerProcess (the app's own binary under
     * `ELECTRON_RUN_AS_NODE=1`) loads server.cjs from here; because the files
     * are real (not inside the asar), it resolves the runtime dependencies by
     * walking up from server.cjs to runtime/node_modules.
     */
    packageAfterCopy: async (_config, buildPath) => {
      try {
        const runtimeDir = join(dirname(buildPath), "runtime")
        await rm(runtimeDir, { recursive: true, force: true })
        await mkdir(join(runtimeDir, "node_modules"), { recursive: true })

        await copyServerBundle(runtimeDir)
        await copyRuntimeClosure(runtimeDir)
        await pruneRuntime(runtimeDir)
        console.log(`forge: staged server runtime at ${runtimeDir}`)
      } catch (err) {
        console.error("forge packageAfterCopy failed:", err)
        throw err
      }
    },
  },
}

export default config

/** Resolve and copy the @nyx/server production bundle as runtime/server.cjs. */
async function copyServerBundle(runtimeDir: string): Promise<void> {
  const serverPkg = resolve(__dirname, "../../packages/server")
  const dist = join(serverPkg, "dist")
  const src = join(dist, "server.cjs")
  try {
    const st = await stat(src)
    if (!st.isFile()) throw new Error("not a file")
  } catch {
    // Build the server bundle on demand (same command as the repo docs).
    await new Promise<void>((resolveBuild, reject) => {
      const child = spawn("bun", ["--cwd", serverPkg, "run", "build"], {
        stdio: "inherit",
      })
      child.on("exit", (code) =>
        code === 0 ? resolveBuild() : reject(new Error(`server build exited ${code}`)),
      )
      child.on("error", reject)
    })
  }
  await cp(src, join(runtimeDir, "server.cjs"))
}

/**
 * Copy `@huggingface/transformers` + `onnxruntime-node` + `sharp` and their
 * transitive closure into runtime/node_modules, dereferencing bun-store
 * symlinks so the packaged node child gets a self-contained flat tree.
 */
async function copyRuntimeClosure(runtimeDir: string): Promise<void> {
  const destNm = join(runtimeDir, "node_modules")
  const seen = new Set<string>()

  // Seed from a context whose node_modules graph already resolves these.
  // packages/server links @huggingface/transformers; walking up from that
  // package's real store location reaches the enclosing node_modules that
  // links onnxruntime-node, its common lib, and sharp — the same graph a
  // packaged child walks.
  const seedDir = resolve(__dirname, "../../packages/server")
  const transformersDir = await resolvePackageDir("@huggingface/transformers", seedDir)
  if (!transformersDir) throw new Error("cannot resolve @huggingface/transformers from packages/server")

  for (const spec of ["@huggingface/transformers", "onnxruntime-node", "onnxruntime-common", "sharp"]) {
    const from = await resolvePackageDir(spec, transformersDir)
    if (!from) throw new Error(`cannot resolve runtime dependency ${spec} for desktop packaging`)
    await copyClosure(spec, from, destNm, seen)
  }
}

/**
 * Skip dependencies that the packaged node child never loads:
 *  - onnxruntime-web: browsers-only. transformers' node entry bundles it as a
 *    webpack-ignored module, so it is never required at runtime under node.
 */
const SKIP_DEPS = new Set(["onnxruntime-web"])

/** Platform/arch pairs onnxruntime-node ships native binaries for. */
const ORT_PLATFORMS = new Set(["darwin", "linux", "win32"])

/** Map electron's arch names to onnxruntime-node's (x64/arm64 are shared). */
function ortArch(arch: string): string {
  return arch === "x64" || arch === "arm64" ? arch : "x64"
}

/** Walk up from `fromDir` through node_modules to find `spec`'s real directory. */
async function resolvePackageDir(spec: string, fromDir: string): Promise<string | null> {
  let dir = fromDir
  for (;;) {
    const candidate = join(dir, "node_modules", spec)
    try {
      const st = await stat(candidate)
      if (st.isDirectory()) return realpath(candidate)
      const real = await realpath(candidate)
      if ((await stat(real)).isDirectory()) return real
    } catch {
      /* fall through */
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Recursively copy `pkg` (dereferencing bun-store symlinks) plus its runtime
 * dependencies into `destNm`. Dependencies resolve upward from the package's
 * real location, mirroring node resolution so the flat target tree works.
 */
async function copyClosure(
  pkgName: string,
  srcDir: string,
  destNm: string,
  seen = new Set<string>(),
): Promise<void> {
  const realDir = await realpath(srcDir)
  if (seen.has(realDir)) return
  seen.add(realDir)

  const dest = join(destNm, pkgName)
  await mkdir(dirname(dest), { recursive: true })
  await cp(realDir, dest, { recursive: true, dereference: true })

  const pkgJson = join(realDir, "package.json")
  const raw = await readFile(pkgJson, "utf8").catch(() => null)
  if (!raw) return
  const pkg = JSON.parse(raw)

  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies }
  if (!deps) return

  for (const dep of Object.keys(deps)) {
    if (SKIP_DEPS.has(dep)) continue
    // sharp ships per-platform native binaries; copy only the current one
    // (plus colour + libvips runtimes, which themselves carry optional deps).
    if (pkgName === "sharp" || pkgName.startsWith("@img/")) {
      if (pkg.optionalDependencies?.[dep] && !dep.includes(`-${process.platform}-${process.arch}`)) {
        continue
      }
    }
    // Resolve transitive deps from the real source package location, where
    // the enclosing store node_modules still links them.
    const depDir = await resolvePackageDir(dep, realDir)
    if (depDir) await copyClosure(dep, depDir, destNm, seen)
  }
}

/**
 * Prune platform/arch-specific payloads from the staged runtime so only the
 * current platform ships. onnxruntime-node bundles every OS/arch native
 * binary (hundreds of MB); keep only the one `binding.js` will load.
 */
async function pruneRuntime(runtimeDir: string): Promise<void> {
  const nm = join(runtimeDir, "node_modules")

  // onnxruntime-node: keep bin/napi-v6/<platform>/<arch>, drop the rest.
  const ortPkg = join(nm, "onnxruntime-node")
  const napiDir = join(ortPkg, "bin", "napi-v6")
  const platformDir = join(napiDir, process.platform)
  const archDir = join(platformDir, ortArch(process.arch))
  if (ORT_PLATFORMS.has(process.platform)) {
    for (const plat of ORT_PLATFORMS) {
      if (plat !== process.platform) {
        await rm(join(napiDir, plat), { recursive: true, force: true })
      }
    }
    // Keep only the matching arch under the platform dir.
    for (const child of await readdir(platformDir)) {
      if (join(platformDir, child) !== archDir) {
        await rm(join(platformDir, child), { recursive: true, force: true })
      }
    }
  }

  // transformers: node entry loads transformers.node.cjs; drop the web/wasm
  // variants and sourcemaps shipped in dist.
  const tfDist = join(nm, "@huggingface", "transformers", "dist")
  for (const file of await readdir(tfDist)) {
    if (file.endsWith(".map")) continue
    // web build + generic non-node bundles + ort-wasm assets are unused.
    if (
      file.startsWith("transformers.web") ||
      file === "transformers.js" ||
      file.startsWith("transformers.min.js") ||
      file.startsWith("ort-wasm")
    ) {
      await rm(join(tfDist, file), { recursive: true, force: true })
    }
  }

  // Sourcemaps are debug-only; drop them across the whole closure.
  await rmMaps(runtimeDir)
}

async function rmMaps(dir: string): Promise<void> {
  const entries = await readdir(dir).catch(() => [])
  for (const entry of entries) {
    const full = join(dir, entry)
    const st = await stat(full).catch(() => null)
    if (!st) continue
    if (st.isDirectory()) {
      await rmMaps(full)
    } else if (entry.endsWith(".map")) {
      await rm(full, { force: true })
    }
  }
}
