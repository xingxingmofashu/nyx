import type { ForgeConfig } from "@electron-forge/shared-types"
import { spawn } from "node:child_process"
import { chmod, cp, mkdir, readFile, readdir, realpath, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "Nyx",
    appBundleId: "com.nyx.desktop",
    icon: join(__dirname, "assets", "light", "icon"),
    extendInfo: {
      NSMicrophoneUsageDescription: "Nyx transcribes your speech with local models.",
    },
    download: {
      unsafelyDisableChecksums: true,
    },
    prune: false,
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
            entry: { main: "src/main/bin.ts" },
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
        title: "Nyx",
        icon: join(__dirname, "assets", "light", "icon.icns"),
        background: join(__dirname, "assets", "dmg", "background.png"),
        iconSize: 128,
        format: "ULFO",
        contents: (opts: { appPath: string }) => [
          { x: 180, y: 230, type: "file", path: opts.appPath, name: "Nyx.app" },
          { x: 478, y: 230, type: "link", path: "/Applications", name: "Applications" },
        ],
        additionalDMGOptions: {
          "background-color": "#ececf0",
          window: { size: { width: 658, height: 498 } },
        },
      },
    },
  ],
  hooks: {
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

async function copyRuntimeClosure(runtimeDir: string): Promise<void> {
  const destNm = join(runtimeDir, "node_modules")
  const seen = new Set<string>()

  const seedDir = resolve(__dirname, "../../packages/agent")
  const transformersDir = await resolvePackageDir("@huggingface/transformers", seedDir)
  if (!transformersDir) throw new Error("cannot resolve @huggingface/transformers from packages/agent")

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

const SKIP_DEPS = new Set(["onnxruntime-web", "openai"])

const LANCE_SKIP_DEPS = new Set(["@huggingface/transformers"])

const ORT_PLATFORMS = new Set(["darwin", "linux", "win32"])

function ortArch(arch: string): string {
  return arch === "x64" || arch === "arm64" ? arch : "x64"
}

async function resolvePackageDir(spec: string, fromDir: string): Promise<string | null> {
  let dir = fromDir
  for (;;) {
    const candidate = join(dir, "node_modules", spec)
    try {
      const st = await stat(candidate)
      if (st.isDirectory()) return realpath(candidate)
      const real = await realpath(candidate)
      if ((await stat(real)).isDirectory()) return real
    } catch {}
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

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
    if (pkgName === "sharp" || pkgName.startsWith("@img/")) {
      if (pkg.optionalDependencies?.[dep] && !dep.includes(`-${process.platform}-${process.arch}`)) {
        continue
      }
    }
    const depDir = await resolvePackageDir(dep, realDir)
    if (depDir) await copyClosure(dep, depDir, destNm, seen)
  }
}

async function pruneRuntime(runtimeDir: string): Promise<void> {
  const nm = join(runtimeDir, "node_modules")

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
    for (const child of await readdir(platformDir)) {
      if (join(platformDir, child) !== archDir) {
        await rm(join(platformDir, child), { recursive: true, force: true })
      }
    }
  }

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

  const tfDist = join(nm, "@huggingface", "transformers", "dist")
  for (const file of await readdir(tfDist)) {
    if (file.endsWith(".map")) continue
    if (
      file.startsWith("transformers.web") ||
      file === "transformers.js" ||
      file.startsWith("transformers.min.js") ||
      file.startsWith("ort-wasm")
    ) {
      await rm(join(tfDist, file), { recursive: true, force: true })
    }
  }

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
