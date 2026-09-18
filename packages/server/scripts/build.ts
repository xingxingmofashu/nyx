import { readdirSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"

const SERVER_DIR = resolve(import.meta.dir, "..")
const OUT_FILE = join(SERVER_DIR, "dist", "nyx-server")

const EXTERNAL = [
  "@huggingface/transformers",
  "onnxruntime-node",
  "onnxruntime-common",
  "sharp",
  "@lancedb/lancedb",
]

const os = process.platform === "win32" ? "windows" : process.platform
const target = `bun-${os}-${process.arch}` as Bun.Build.CompileTarget

function cleanBunBuildFiles(): void {
  for (const name of readdirSync(SERVER_DIR)) {
    if (name.endsWith(".bun-build")) rmSync(join(SERVER_DIR, name), { force: true })
  }
}

cleanBunBuildFiles()
const result = await Bun.build({
  entrypoints: [join(SERVER_DIR, "src", "bin.ts")],
  root: SERVER_DIR,
  external: EXTERNAL,
  compile: { target, outfile: OUT_FILE, autoloadPackageJson: true },
})
cleanBunBuildFiles()

if (!result.success) {
  for (const log of result.logs) console.error(log.message)
  process.exit(1)
}

console.log(`built ${OUT_FILE}`)
