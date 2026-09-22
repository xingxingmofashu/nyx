import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { streamSSE } from "hono/streaming"
import { z } from "zod/v4"
import { LLM } from "@nyx/llm"
import { Agent } from "@nyx/agent"
import { Global } from "@nyx/global"
import { Errors } from "../errors.ts"
import { OkSchema, PullCancelledSchema } from "../responses.ts"

export class Models {
  private static readonly listRoute = createRoute({
    method: "get",
    path: "/",
    responses: {
      200: {
        content: { "application/json": { schema: z.array(Global.ModelInfoSchema) } },
        description: "Cached and downloadable models",
      },
    },
  })

  private static readonly pullRoute = createRoute({
    method: "post",
    path: "/pull",
    request: {
      body: { content: { "application/json": { schema: Agent.Services.ModelPullRequestSchema } }, required: true },
    },
    responses: {
      200: { description: "Server-sent progress stream for the download" },
    },
  })

  private static readonly pullCancelRoute = createRoute({
    method: "post",
    path: "/pull/cancel",
    request: {
      body: { content: { "application/json": { schema: Agent.Services.ModelIdRequestSchema } }, required: true },
    },
    responses: {
      200: {
        content: { "application/json": { schema: PullCancelledSchema } },
        description: "Whether a running pull was cancelled",
      },
    },
  })

  private static readonly deleteRoute = createRoute({
    method: "delete",
    path: "/",
    request: {
      body: { content: { "application/json": { schema: Agent.Services.ModelIdRequestSchema } }, required: true },
    },
    responses: {
      200: {
        content: { "application/json": { schema: OkSchema } },
        description: "Model removed from the local cache",
      },
    },
  })

  static create(store: Agent.Services.Models) {
    return new OpenAPIHono({ defaultHook: Errors.hook })
      .openapi(Models.listRoute, async (c) => c.json(await store.listModels(), 200))
      .openapi(Models.pullRoute, (c) => {
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
          stream.onAbort(() => controller.abort())

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
      .openapi(Models.pullCancelRoute, (c) => {
        const cancelled = store.cancelPull(c.req.valid("json").model)
        return c.json({ ok: true, cancelled }, 200)
      })
      .openapi(Models.deleteRoute, async (c) => {
        const { model } = c.req.valid("json")
        if (store.isPulling(model)) throw Errors.status(409, new Error(`model is being downloaded: ${model}`))
        if (!(await store.removeModel(model))) {
          throw Errors.status(404, new Error(`model not cached: ${model}`))
        }
        return c.json({ ok: true }, 200)
      })
  }
}
