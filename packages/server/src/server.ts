/**
 * Standalone entry — run as `node packages/server/dist/server.cjs`.
 *
 * Config via env:
 *   NYX_SERVER_TOKEN — required auth token
 *   NYX_SERVER_PORT  — port (default 0 = ephemeral)
 *   NYX_SERVER_HOST  — bind host (default 127.0.0.1)
 *
 * On ready prints `nyx-server-ready <url>` to stdout so the spawning
 * Electron main can discover the actual port.
 */
import { start } from "./index"

const token = process.env.NYX_SERVER_TOKEN
if (!token) {
  console.error("NYX_SERVER_TOKEN is required")
  process.exit(1)
}

const port = process.env.NYX_SERVER_PORT ? Number(process.env.NYX_SERVER_PORT) : 0
const host = process.env.NYX_SERVER_HOST ?? "127.0.0.1"

start({ token, port, host })
  .then((server) => {
    console.log(`nyx-server-ready ${server.url}`)
  })
  .catch((error) => {
    console.error("failed to start server:", error)
    process.exit(1)
  })
