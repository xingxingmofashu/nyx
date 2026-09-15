import type { ForgeConfig } from "@electron-forge/shared-types"
import { spawn } from "node:child_process"
import { chmod, cp, mkdir, readFile, readdir, realpath, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
/**
 * Electron Forge configuration.
 *
 * Build: `@electron-forge/plugin-vite` compiles main/preload/renderer (see
 * vite.main.config.ts + vite.renderer.config.ts). The Vite bundles inline all
 * pure-JS dependencies (@nyx/*, react, ...); only `electron` + node builtins
 * are required at runtime, so the packaged asar needs no node_modules.
 *
 * Inference server: `@nyx/server` is compiled by `bun build --compile` into a
 * self-contained `nyx-server` executable (server code + Bun runtime). It cannot
 * embed the native modules — onnxruntime-node/sharp/LanceDB `.node` addons
 * `dlopen` sibling shared libraries — so `packageAfterCopy` stages the binary
 * plus their flat runtime closure into `Resources/runtime/` as real files, the
 * layout `NyxServerProcess` resolves and spawns in production.
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
    // macOS requires a usage description for the microphone; without it the OS
    // terminates the app on the first `getUserMedia` call.
    extendInfo: {
      NSMicrophoneUsageDescription: "Nyx transcribes your speech with local models.",
    },
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
     *     nyx-server                (`bun build --compile` executable)
     *     node_modules/…            dereferenced transformers + native closure
     *
     * NyxServerProcess spawns `nyx-server` directly with `cwd` set here; since
     * the modules are real files (not inside the asar), the executable resolves
     * its `--external` native deps by walking cwd's `node_modules`.
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

/**
 * Stage the `nyx-server` binary into the runtime dir, always rebuilding it
 * first.
 *
 * The hook cannot tell whether an existing `dist/nyx-server` predates a server
 * source change, so reusing it risks shipping a stale server; rebuilding is
 * cheap (`tsc --noEmit` + `bun build --compile`). The `--cwd` flag must follow
 * `run`: `bun --cwd <dir> run build` is not a valid form — bun prints its help
 * and exits 0, which would leave the binary missing while looking like a
 * success.
 */
async function copyServerBundle(runtimeDir: string): Promise<void> {
  const serverPkg = resolve(__dirname, "../../packages/server")
  const src = join(serverPkg, "dist", "nyx-server")
  await new Promise<void>((resolveBuild, reject) => {
    const child = spawn("bun", ["run", "--cwd", serverPkg, "build"], {
      stdio: "inherit",
    })
    child.on("exit", (code) =>
      code === 0 ? resolveBuild() : reject(new Error(`server build exited ${code}`)),
    )
    child.on("error", reject)
  })
  const built = await stat(src).then(
    (st) => st.isFile(),
    () => false,
  )
  if (!built) {
    throw new Error(`server binary missing after build: ${src}`)
  }
  const dest = join(runtimeDir, "nyx-server")
  await cp(src, dest)
  await chmod(dest, 0o755)
}

/**
 * Copy the external runtime closure (transformers + onnxruntime-node + sharp +
 * LanceDB) into runtime/node_modules, dereferencing bun-store symlinks so the
 * packaged child gets a self-contained flat tree.
 */
async function copyRuntimeClosure(runtimeDir: string): Promise<void> {
  const destNm = join(runtimeDir, "node_modules")
  const seen = new Set<string>()

  // Seed from a context whose node_modules graph already resolves these.
  // packages/server links @huggingface/transformers and @lancedb/lancedb;
  // walking up from that package's real store location reaches the enclosing
  // node_modules that links onnxruntime-node, its common lib, and sharp.
  const seedDir = resolve(__dirname, "../../packages/server")
  const transformersDir = await resolvePackageDir("@huggingface/transformers", seedDir)
  if (!transformersDir) throw new Error("cannot resolve @huggingface/transformers from packages/server")

  for (const spec of [
    "@huggingface/transformers",
    "onnxruntime-node",
    "onnxruntime-common",
    "sharp",
    "@lancedb/lancedb",
    "apache-arrow",
  ]) {
    const from = await resolvePackageDir(spec, seedDir) ?? await resolvePackageDir(spec, transformersDir)
    if (!from) throw new Error(`cannot resolve runtime dependency ${spec} for desktop packaging`)
    await copyClosure(spec, from, destNm, seen)
  }
}

/**
 * Skip dependencies that the packaged binary never loads:
 *  - onnxruntime-web: browsers-only. transformers' node entry bundles it as a
 *    webpack-ignored module, so it is never required at runtime under node.
 *  - openai: an optional dependency of LanceDB's embedding registry; nyx
 *    computes embeddings itself and never imports it.
 */
const SKIP_DEPS = new Set(["onnxruntime-web", "openai"])

/** Dependencies of `@lancedb/lancedb` that nyx supplies/does not use. */
const LANCE_SKIP_DEPS = new Set(["@huggingface/transformers"])

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
    if (pkgName === "@lancedb/lancedb" && LANCE_SKIP_DEPS.has(dep)) continue
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

  // @lancedb/lancedb: keep the host platform's native package only.
  const lancedbScope = join(nm, "@lancedb")
  for (const entry of await readdir(lancedbScope).catch(() => [])) {
    if (entry === "lancedb") continue
    const matchesHost =
      entry.includes(`-${process.platform}-`) &&
      entry.includes(process.arch) &&
      !entry.includes("musl")
    if (!matchesHost) {
      await rm(join(lancedbScope, entry), { recursive: true, force: true })
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
