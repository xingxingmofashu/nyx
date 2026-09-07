import { Hono } from "hono"
import type { LlmTask } from "@nyx/llm"
import type { InferenceService } from "../services/inference"

/** /v1/models — list and download cached models. */
export function models(service: InferenceService): Hono {
  const app = new Hono()

  app.get("/", (c) => c.json(service.listModels()))

  app.post("/pull", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const model = (body as { model?: string }).model
    const task = (body as { task?: string }).task
    if (!model || (task !== "text-generation" && task !== "image-to-image")) {
      return c.json({ error: "model and a valid task are required" }, 400)
    }
    try {
      await service.pullModel(model, task as LlmTask)
      return c.json({ ok: true })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })

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
