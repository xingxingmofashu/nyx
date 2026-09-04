import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { NyxServerClient } from "./client"

/** Generous ceiling for first startup (model load can be slow). */
const READY_TIMEOUT_MS = 15_000

/**
 * Manages the @nyx/server child process that runs inference.
 *
 * onnxruntime-node crashes inside Electron's Node runtime (SIGTRAP), so
 * inference runs in a plain process spawned here. `ELECTRON_RUN_AS_NODE=1`
 * makes the app's own Electron binary act as a plain Node runtime — no system
 * `node` install is required (and the server's onnxruntime/sharp natives load
 * fine there). The server binds to 127.0.0.1 with a random bearer token and
 * prints `nyx-server-ready <url>` on stdout once listening.
 */
export class NyxServer {
  private child: ChildProcess | null = null
  private token = ""
  private baseUrl = ""
  private serverClient: NyxServerClient | null = null
  private ready: Promise<void> | null = null

  /** Resolved server location; throws when the server has not started. */
  get url(): string {
    if (!this.baseUrl) throw new Error("nyx server is not running")
    return this.baseUrl
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

    const script = this.resolveBundle()
    const child = spawn(process.execPath, [script], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NYX_SERVER_TOKEN: this.token,
        NYX_SERVER_PORT: "0",
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
          this.baseUrl = match[1]!
          resolve()
        }
      })
      child.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(`[nyx-server] ${chunk.toString()}`)
      })
      child.on("exit", () => {
        clearTimeout(timer)
        this.child = null
        this.baseUrl = ""
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
    this.baseUrl = ""
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

  private resolveBundle(): string {
    const candidates = [
      join(__dirname, "../../../../packages/server/dist/server.cjs"),
      join(process.resourcesPath ?? "", "runtime", "server.cjs"),
    ]
    const script = candidates.find((p) => existsSync(p))
    if (!script) {
      throw new Error("nyx server bundle not found; build @nyx/server first (bun --cwd packages/server run build)")
    }
    return script
  }
}
