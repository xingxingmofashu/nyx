import { Global } from "@nyx/global"

const token = process.env.NYX_SERVER_TOKEN
if (!token) {
  console.error("NYX_SERVER_TOKEN is required")
  process.exit(1)
}

const port = process.env.NYX_SERVER_PORT ? Number(process.env.NYX_SERVER_PORT) : 0
const host = process.env.NYX_SERVER_HOST ?? "127.0.0.1"

const hub = (await Global.Settings.read()).huggingface?.remoteHost?.replace(/\/$/, "")
if (hub) {
  process.env.HF_ENDPOINT = hub
}

const { Server } = await import("./index.ts")

Server.App.serve({ token, port, host, onLog: (message) => process.stderr.write(`[knowledge] ${message}\n`) })
  .then((server) => {
    console.log(`nyx-server-ready ${server.url}`)
  })
  .catch((error) => {
    console.error("failed to start server:", error)
    process.exit(1)
  })
