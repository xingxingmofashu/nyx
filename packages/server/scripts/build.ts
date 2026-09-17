/**
 * Build `@nyx/server` into a self-contained Bun executable (`dist/nyx-server`)
 * with `Bun.build({ compile })`.
 *
 * The binary embeds the server code + the Bun runtime. Heavy/native modules stay
 * external and are resolved at runtime from the host's `node_modules` (the
 * Forge-staged runtime closure in production): they cannot be embedded because
 * their `.node` addons `dlopen` sibling shared libraries (onnxruntime, sharp).
 * `autoloadPackageJson` is required for Bun to resolve those externals from the
 * working directory's node_modules.
 */
import { readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const SERVER_DIR = resolve(import.meta.dir, "..");
const OUT_FILE = join(SERVER_DIR, "dist", "nyx-server");

/** Packages kept external (native or onnx-adjacent); must exist at runtime. */
const EXTERNAL = [
  "@huggingface/transformers",
  "onnxruntime-node",
  "onnxruntime-common",
  "sharp",
  "@lancedb/lancedb",
];

const os = process.platform === "win32" ? "windows" : process.platform;
const target = `bun-${os}-${process.arch}` as Bun.Build.CompileTarget;

/**
 * Bun writes the compiled payload to a hidden `.<hash>-00000000.bun-build` file
 * in the working directory and never unlinks it, so a build would leave ~57 MB
 * behind every time. Drop them before and after, which also clears a run that
 * was killed.
 */
function cleanBunBuildFiles(): void {
  for (const name of readdirSync(SERVER_DIR)) {
    if (name.endsWith(".bun-build")) rmSync(join(SERVER_DIR, name), { force: true });
  }
}

cleanBunBuildFiles();
const result = await Bun.build({
  entrypoints: [join(SERVER_DIR, "src", "main.ts")],
  root: SERVER_DIR,
  external: EXTERNAL,
  compile: { target, outfile: OUT_FILE, autoloadPackageJson: true },
});
cleanBunBuildFiles();

if (!result.success) {
  for (const log of result.logs) console.error(log.message);
  process.exit(1);
}

console.log(`built ${OUT_FILE}`);
