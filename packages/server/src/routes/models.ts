import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { LLMTask, ProgressInfo } from "@nyx/llm"
import type { InferenceService } from "../services/inference"

/** /v1/models — list, download, and delete cached models. */
export function models(service: InferenceService): Hono {
  const app = new Hono()

  app.get("/", (c) => c.json(service.listModels()))

  /** POST /pull — SSE stream of download progress; ends with done/error. */
  app.post("/pull", (c) =>
    streamSSE(c, async (stream) => {
      const body = await c.req.json().catch(() => ({}))
      const model = (body as { model?: string }).model
      const task = (body as { task?: string }).task
      if (!model || (task !== "text-generation" && task !== "image-to-image")) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: "model and a valid task are required" }),
        })
        return
      }

      const onProgress = (info: ProgressInfo) => {
        if (info.status === "progress" && info.total > 0) {
          void stream.writeSSE({
            event: "progress",
            data: JSON.stringify({
              file: info.file,
              loaded: info.loaded,
              total: info.total,
              percent: Math.round((info.loaded / info.total) * 100),
            }),
          })
        } else if (info.status === "done") {
          void stream.writeSSE({ event: "done", data: JSON.stringify({ file: info.file }) })
        }
      }

      try {
        await service.pullModel(model, task as LLMTask, onProgress)
        await stream.writeSSE({ event: "done", data: JSON.stringify({ file: undefined }) })
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: error instanceof Error ? error.message : String(error) }),
        })
      }
    }),
  )

  app.delete("/", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const model = (body as { model?: string }).model
    if (!model) {
      return c.json({ error: "model is required" }, 400)
    }
    if (!service.removeModel(model)) {
      return c.json({ error: `model not cached: ${model}` }, 404)
    }
    return c.json({ ok: true })
  })

  return app
}
