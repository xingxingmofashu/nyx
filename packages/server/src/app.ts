import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { LLMMessage, ProgressInfo } from "@nyx/llm"
import {
  listModels,
  pullModelWithMeta,
  runImageToImage,
  streamChat,
  type ImageInput,
  type ModelTask,
} from "./services"

export interface ServerAppOptions {
  token?: string
}

export function createApp(options: ServerAppOptions = {}): Hono {
  const app = new Hono()
  const { token } = options

  // Bearer token auth when a token is configured (spawned by the desktop app).
  if (token) {
    app.use("*", async (c, next) => {
      const auth = c.req.header("authorization")
      if (auth !== `Bearer ${token}`) {
        return c.json({ error: "unauthorized" }, 401)
      }
      await next()
    })
  }

  app.get("/v1/health", (c) => c.json({ ok: true }))

  app.get("/v1/models", (c) => c.json(listModels()))

  app.post("/v1/models/pull", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const model = (body as { model?: string }).model
    const task = (body as { task?: string }).task as ModelTask | undefined
    if (!model || !task) return c.json({ error: "model and task are required" }, 400)
    try {
      await pullModelWithMeta(model, task)
      return c.json({ ok: true })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })

  app.post("/v1/chat", (c) =>
    streamSSE(c, async (stream) => {
      const body = await c.req.json().catch(() => ({}))
      const model = (body as { model?: string }).model
      const message = (body as { message?: string }).message
      if (!model || !message) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "model and message are required" }) })
        return
      }
      const messages: LLMMessage[] = [{ role: "user", content: message }]
      try {
        let full = ""
        for await (const event of streamChat(model, messages)) {
          if (event.type === "text-delta") {
            full += event.delta
            await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: event.delta }) })
          } else {
            await stream.writeSSE({ event: "error", data: JSON.stringify({ message: event.message }) })
            return
          }
        }
        await stream.writeSSE({ event: "end", data: JSON.stringify({ text: full }) })
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: error instanceof Error ? error.message : String(error) }),
        })
      }
    }),
  )

  app.post("/v1/image-to-image", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const model = (body as { model?: string }).model
    const image = (body as { image?: ImageInput }).image
    if (!model || !image?.data) return c.json({ error: "model and image are required" }, 400)
    try {
      const result = await runImageToImage(model, image)
      return c.json(result)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })

  return app
}

export type { ProgressInfo }
