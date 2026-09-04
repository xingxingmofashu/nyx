import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { NyxServerClient } from "./client"

/**
 * Manages the @nyx/server child process that runs inference.
 *
 * onnxruntime-node crashes inside Electron's Node runtime (SIGTRAP), so
 * inference runs in a plain Node process spawned here. The server binds to
 * 127.0.0.1 with a random bearer token and prints
 * `nyx-server-ready <url>` on stdout once listening.
 */
export class ServerManager {
  private child: ChildProcess | null = null
  private token = ""
  private baseUrl = ""
  private readyResolvers: Array<() => void> = []
  private serverClient: NyxServerClient | null = null

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
    if (this.child) return
    this.token = randomBytes(24).toString("hex")

    // Resolve the bundled server script. Dev: workspace dist. Packaged:
    // resources/ (added by forge hooks later).
    const candidates = [
      join(__dirname, "../../../../packages/server/dist/server.cjs"),
      join(process.resourcesPath ?? "", "server.cjs"),
    ]
    const script = candidates.find((p) => existsSync(p))
    if (!script) {
      throw new Error("nyx server bundle not found; build @nyx/server first (bun --cwd packages/server run build)")
    }

    const child = spawn("node", [script], {
      env: { ...process.env, NYX_SERVER_TOKEN: this.token, NYX_SERVER_PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    })
    this.child = child

    let stdoutBuf = ""
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString()
      const match = stdoutBuf.match(/nyx-server-ready (\S+)/)
      if (match) {
        this.baseUrl = match[1]!
        for (const resolve of this.readyResolvers) resolve()
        this.readyResolvers = []
      }
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`[nyx-server] ${chunk.toString()}`)
    })
    child.on("exit", (code) => {
      this.child = null
      this.baseUrl = ""
      process.stderr.write(`[nyx-server] exited with code ${code}\n`)
    })
    child.on("error", (error) => {
      process.stderr.write(`[nyx-server] failed to spawn: ${error.message}\n`)
    })

    // Wait for the ready line (with a generous timeout for first model load).
    if (!this.baseUrl) {
      await new Promise<void>((resolve, reject) => {
        this.readyResolvers.push(resolve)
        const timer = setTimeout(() => reject(new Error("nyx server did not become ready in time")), 15000)
        child.on("exit", () => {
          clearTimeout(timer)
          reject(new Error("nyx server exited during startup"))
        })
      })
    }
  }

  /** Stop the server process. */
  async stop(): Promise<void> {
    if (!this.child) return
    const child = this.child
    this.child = null
    child.kill()
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve()
      child.once("exit", () => resolve())
      // Force-kill if graceful exit stalls.
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL")
        resolve()
      }, 2000)
    })
  }
}
