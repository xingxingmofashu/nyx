import { Hono } from "hono"
import { listModels, pullModel } from "../services/models"
import type { ModelTask } from "../shared/types"

/** /v1/models — list and download cached models. */
export const modelsRoutes = new Hono()

modelsRoutes.get("/", (c) => c.json(listModels()))

modelsRoutes.post("/pull", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const model = (body as { model?: string }).model
  const task = (body as { task?: string }).task
  if (!model || (task !== "text-generation" && task !== "image-to-image")) {
    return c.json({ error: "model and a valid task are required" }, 400)
  }
  try {
    await pullModel(model, task as ModelTask)
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
