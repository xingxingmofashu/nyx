import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import { LLM } from "@nyx/llm"
import { Agent } from "@nyx/agent"
import { Errors } from "../errors.ts"

export class Models {
  static create(store: Agent.Services.Models) {
    return new Hono()
      .get("/", async (c) => c.json(await store.listModels()))

      .post("/pull", zValidator("json", Agent.Services.ModelPullRequestSchema, Errors.hook), (c) => {
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

          const onProgress = (info: LLM.ProgressInfo) => {
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
            if (error instanceof LLM.PullAbortedError) {
              await store.removeModel(model)
              await stream.writeSSE({ event: "cancelled", data: JSON.stringify({ file: undefined }) })
            } else {
              await stream.writeSSE({
                event: "error",
                data: JSON.stringify({ message: Errors.message(error) }),
              })
            }
          } finally {
            store.endPull(model)
          }
        })
      })

      .post("/pull/cancel", zValidator("json", Agent.Services.ModelIdRequestSchema, Errors.hook), (c) => {
        const cancelled = store.cancelPull(c.req.valid("json").model)
        return c.json({ ok: true, cancelled })
      })

      .delete("/", zValidator("json", Agent.Services.ModelIdRequestSchema, Errors.hook), async (c) => {
        const { model } = c.req.valid("json")
        if (!(await store.removeModel(model))) {
          throw Errors.status(404, new Error(`model not cached: ${model}`))
        }
        return c.json({ ok: true })
      })
  }
}
