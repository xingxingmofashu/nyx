import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import { PullAbortedError, type ProgressInfo } from "@nyx/llm"
import { ModelIdRequestSchema, ModelPullRequestSchema } from "../schema"
import { validationHook } from "../validation"
import type { ModelsService } from "../services/models"

/** /v1/models — list, download, cancel, and delete cached models. */
export function models(store: ModelsService) {
  return new Hono()
    .get("/", (c) => c.json(store.listModels()))

    /** POST /pull — SSE stream of download progress; ends with done/cancelled/error. */
    .post("/pull", zValidator("json", ModelPullRequestSchema, validationHook), (c) => {
      const { model, task } = c.req.valid("json")

      return streamSSE(c, async (stream) => {
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
          await store.pullModel(model, task, onProgress, controller.signal)
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
      })
    })

    /** POST /pull/cancel — stop an in-flight pull by model id. */
    .post("/pull/cancel", zValidator("json", ModelIdRequestSchema, validationHook), (c) => {
      const cancelled = store.cancelPull(c.req.valid("json").model)
      return c.json({ ok: true, cancelled })
    })

    .delete("/", zValidator("json", ModelIdRequestSchema, validationHook), (c) => {
      const { model } = c.req.valid("json")
      if (!store.removeModel(model)) {
        return c.json({ error: `model not cached: ${model}` }, 404)
      }
      return c.json({ ok: true })
    })
}
