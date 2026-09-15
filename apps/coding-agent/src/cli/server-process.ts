/**
 * Starts the inference server as a child process for the CLI.
 *
 * The agent TUI owns the terminal and switches to the alternate screen; any
 * output from the server would interleave with the render and corrupt it. That
 * output is not all interceptable — native code (LanceDB, onnxruntime, sharp)
 * writes straight to fd 2, bypassing `process.stderr`. Running the server in a
 * child process isolates it completely: stdout is read for the ready line and
 * everything else goes to `~/.nyx/logs/server.log`.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfigDir } from "@nyx/config";

/** Generous ceiling: the first start may load an embedding model. */
const READY_TIMEOUT_MS = 30_000;

export interface ServerProcessHandle {
  url: string;
  token: string;
  stop: () => Promise<void>;
}

/** Spawn the server and resolve once it reports `nyx-server-ready <url>`. */
export function startServerProcess(): Promise<ServerProcessHandle> {
  const token = randomBytes(24).toString("hex");
  const { cmd, args, cwd } = resolveServerCommand();

  const logPath = join(getConfigDir(), "logs", "server.log");
  mkdirSync(dirname(logPath), { recursive: true });
  const log = createWriteStream(logPath, { flags: "a" });

  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, NYX_SERVER_TOKEN: token, NYX_SERVER_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stop = (): Promise<void> =>
    new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      child.once("exit", () => resolve());
      child.kill();
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolve();
      }, 2000);
    });

  return new Promise<ServerProcessHandle>((resolve, reject) => {
    const timer = setTimeout(() => {
      void stop();
      reject(new Error(`nyx server did not become ready in ${READY_TIMEOUT_MS}ms`));
    }, READY_TIMEOUT_MS);

    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      const match = stdout.match(/nyx-server-ready (\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ url: match[1]!, token, stop });
      } else {
        log.write(chunk);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => log.write(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`failed to start nyx server: ${error.message}`));
    });
    child.on("exit", () => {
      clearTimeout(timer);
      reject(new Error("nyx server exited during startup; see ~/.nyx/logs/server.log"));
    });
  });
}

/**
 * Prefer the compiled binary; fall back to the `@nyx/server` TypeScript entry
 * run by the current Bun runtime (so `bun run dev` works without a build).
 */
function resolveServerCommand(): { cmd: string; args: string[]; cwd: string } {
  const entry = fileURLToPath(import.meta.resolve("@nyx/server"));
  const srcDir = dirname(entry);
  const pkgDir = dirname(srcDir);

  const binary = join(pkgDir, "dist", "nyx-server");
  if (existsSync(binary)) return { cmd: binary, args: [], cwd: pkgDir };
  return { cmd: process.execPath, args: [join(srcDir, "server.ts")], cwd: pkgDir };
}
