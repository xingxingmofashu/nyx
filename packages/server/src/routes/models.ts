import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { PullAbortedError, type LLMTask, type ProgressInfo } from "@nyx/llm"
import type { ModelStore } from "../services/model-store"

/** /v1/models — list, download, cancel, and delete cached models. */
export function models(store: ModelStore): Hono {
  const app = new Hono()

  app.get("/", (c) => c.json(store.listModels()))

  /** POST /pull — SSE stream of download progress; ends with done/cancelled/error. */
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

      if (store.isPulling(model)) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: `already pulling ${model}` }),
        })
        return
      }

      const controller = store.beginPull(model)

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
        await store.pullModel(model, task as LLMTask, onProgress, controller.signal)
        await stream.writeSSE({ event: "done", data: JSON.stringify({ file: undefined }) })
      } catch (error) {
        if (error instanceof PullAbortedError) {
          // The download was cancelled: drop any partial files so a truncated
          // model is never mistaken for a complete one.
          store.removeModel(model)
          await stream.writeSSE({ event: "cancelled", data: JSON.stringify({ file: undefined }) })
        } else {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ message: error instanceof Error ? error.message : String(error) }),
          })
        }
      } finally {
        store.endPull(model)
      }
    }),
  )

  /** POST /pull/cancel — stop an in-flight pull by model id. */
  app.post("/pull/cancel", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const model = (body as { model?: string }).model
    if (!model) {
      return c.json({ error: "model is required" }, 400)
    }
    const cancelled = store.cancelPull(model)
    return c.json({ ok: true, cancelled })
  })

  app.delete("/", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const model = (body as { model?: string }).model
    if (!model) {
      return c.json({ error: "model is required" }, 400)
    }
    if (!store.removeModel(model)) {
      return c.json({ error: `model not cached: ${model}` }, 404)
    }
    return c.json({ ok: true })
  })

  return app
}
