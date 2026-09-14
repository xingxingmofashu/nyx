import { serve } from "@hono/node-server"
import { createApp, type ServerServices } from "./app"

export interface NyxServerHandle {
  url: string
  port: number
  stop: () => Promise<void>
}

/** Start the inference server; resolves once listening. */
export function start(options: { token?: string; port?: number; host?: string; services?: ServerServices } = {}): Promise<NyxServerHandle> {
  const app = createApp({ token: options.token, services: options.services })
  const port = options.port ?? 0 // 0 = OS-assigned ephemeral port
  const host = options.host ?? "127.0.0.1"

  return new Promise((resolve, reject) => {
    const server = serve(
      { fetch: app.fetch, port, hostname: host, overrideGlobalObjects: false },
      (info) => {
      const actualPort = typeof info === "object" && info !== null ? info.port : port
      resolve({
        url: `http://${host}:${actualPort}`,
        port: actualPort,
        stop: () =>
          new Promise<void>((res) => {
            server.close(() => res())
          }),
      })
    })
    server.on("error", reject)
  })
}

export * from "./shared/types"
