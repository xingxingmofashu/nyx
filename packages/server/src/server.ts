/**
 * Standalone entry, compiled to the `nyx-server` executable
 * (`bun build --compile`; the desktop spawns it from `Resources/runtime/`).
 * Reads NYX_SERVER_TOKEN (required), NYX_SERVER_PORT (default 0 = ephemeral),
 * NYX_SERVER_HOST (default 127.0.0.1). Prints `nyx-server-ready <url>` once
 * listening so the spawning Electron main can discover the port.
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
