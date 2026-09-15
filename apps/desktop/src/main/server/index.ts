import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { NyxServerClient } from "./client"
import { getSettings, DEFAULT_HUB_URL } from "@nyx/config"

/** Generous ceiling for first startup (model load can be slow). */
const READY_TIMEOUT_MS = 15_000

/**
 * Manages the `@nyx/server` child process that runs inference.
 *
 * The server is a self-contained Bun executable (`nyx-server`): it embeds the
 * Bun runtime and server code, while native modules (onnxruntime-node, sharp,
 * LanceDB) are resolved from the `node_modules` beside it — the flat closure
 * Forge stages into `Resources/runtime/` (in dev: `packages/server`, whose
 * workspace `node_modules` links them). The server binds to 127.0.0.1 with a
 * random bearer token and prints `nyx-server-ready <url>` once listening.
 */
export class NyxServerProcess {
  private child: ChildProcess | null = null
  private token = ""
  private baseURL = ""
  private serverClient: NyxServerClient | null = null
  private ready: Promise<void> | null = null

  /** Resolved server location; throws when the server has not started. */
  get url(): string {
    if (!this.baseURL) throw new Error("nyx server is not running")
    return this.baseURL
  }

  get authToken(): string {
    return this.token
  }

  /** Typed HTTP client bound to the running server; created on first use. */
  get client(): NyxServerClient {
    if (!this.serverClient) this.serverClient = new NyxServerClient(this.url, this.token)
    return this.serverClient
  }

  /** Spawn the server process and wait until it reports ready. */
  async start(): Promise<void> {
    if (this.ready) return this.ready
    this.token = randomBytes(24).toString("hex")

    const { script, cwd } = this.resolveBundle()
    const hub = getSettings().hubBaseUrl?.replace(/\/$/, "")
    const child = spawn(script, [], {
      cwd,
      env: {
        ...process.env,
        NYX_SERVER_TOKEN: this.token,
        NYX_SERVER_PORT: "0",
        // The server resolves its external native deps from `cwd`; keep the
        // cwd's node_modules first in the lookup order.
        NODE_PATH: join(cwd, "node_modules"),
        // Let the inference child (where downloads run) use the configured mirror.
        ...(hub && hub !== DEFAULT_HUB_URL ? { HF_ENDPOINT: hub } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    this.child = child

    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("nyx server did not become ready in time")), READY_TIMEOUT_MS)

      let stdoutBuf = ""
      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString()
        const match = stdoutBuf.match(/nyx-server-ready (\S+)/)
        if (match) {
          clearTimeout(timer)
          this.baseURL = match[1]!
          resolve()
        }
      })
      child.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(`[nyx-server] ${chunk.toString()}`)
      })
      child.on("exit", () => {
        clearTimeout(timer)
        this.child = null
        this.baseURL = ""
        reject(new Error("nyx server exited during startup"))
      })
      child.on("error", (error) => {
        clearTimeout(timer)
        reject(new Error(`failed to spawn nyx server: ${error.message}`))
      })
    })

    try {
      await this.ready
    } catch (error) {
      this.ready = null
      this.child = null
      throw error
    }
  }

  /** Stop the server process. */
  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    this.ready = null
    this.serverClient = null
    this.baseURL = ""
    if (!child || child.exitCode !== null) return

    child.kill()
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve())
      // Force-kill if graceful exit stalls.
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL")
        resolve()
      }, 2000)
    })
  }

  private resolveBundle(): { script: string; cwd: string } {
    // Packaged: Forge stages the binary + its flat native closure here.
    const bundled = join(process.resourcesPath ?? "", "runtime", "nyx-server")
    if (process.resourcesPath && existsSync(bundled)) {
      return { script: bundled, cwd: dirname(bundled) }
    }
    // Dev: resolve the external native deps from the server package's
    // workspace node_modules (walking up from the cwd finds them).
    const serverDir = join(__dirname, "../../../../packages/server")
    const dev = join(serverDir, "dist", "nyx-server")
    if (existsSync(dev)) {
      return { script: dev, cwd: serverDir }
    }
    throw new Error("nyx server binary not found; build @nyx/server first (bun --cwd packages/server run build)")
  }
}
