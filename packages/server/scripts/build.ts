/**
 * Build `@nyx/server` into a self-contained Bun executable (`dist/nyx-server`).
 *
 * The binary embeds the server code + the Bun runtime. Heavy/native modules stay
 * external and are resolved at runtime from the host's `node_modules` (the
 * Forge-staged runtime closure in production): they cannot be embedded because
 * their `.node` addons `dlopen` sibling shared libraries (onnxruntime, sharp).
 * `--compile-autoload-package-json` is required for Bun to resolve `--external`
 * packages from the working directory's node_modules.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const SERVER_DIR = resolve(import.meta.dir, "..");

/** Packages kept external (native or onnx-adjacent); must exist at runtime. */
const EXTERNAL = [
  "@huggingface/transformers",
  "onnxruntime-node",
  "onnxruntime-common",
  "sharp",
  "@lancedb/lancedb",
];

const os = process.platform === "win32" ? "windows" : process.platform;
const target = `bun-${os}-${process.arch}`;

const args = [
  "build",
  "./src/main.ts",
  "--compile",
  `--target=${target}`,
  "--compile-autoload-package-json",
  "--outfile",
  "dist/nyx-server",
  ...EXTERNAL.flatMap((name) => ["--external", name]),
];

/**
 * `bun build --compile` writes the compiled payload to a hidden
 * `.<hash>-00000000.bun-build` file in the working directory and never unlinks
 * it (regardless of `--outfile`), so a build would leave ~57 MB behind every
 * time. Drop them before and after, which also clears a run that was killed.
 */
function cleanBunBuildFiles(): void {
  for (const name of readdirSync(SERVER_DIR)) {
    if (name.endsWith(".bun-build")) rmSync(join(SERVER_DIR, name), { force: true });
  }
}

cleanBunBuildFiles();
const result = spawnSync("bun", args, { stdio: "inherit", cwd: SERVER_DIR });
cleanBunBuildFiles();
process.exit(result.status ?? 1);
