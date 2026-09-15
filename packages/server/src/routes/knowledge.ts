import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import {
  KnowledgeCreateRequestSchema,
  KnowledgeSearchRequestSchema,
} from "../shared/types"
import { validationHook } from "../lib/validation"
import type { KnowledgeService } from "../services/knowledge"

/** /v1/knowledge — manage local knowledge bases, index them, and search. */
export function knowledge(service: KnowledgeService) {
  return new Hono()
    .get("/", (c) => c.json(service.list()))

    .post("/", zValidator("json", KnowledgeCreateRequestSchema, validationHook), (c) => {
      try {
        return c.json(service.create(c.req.valid("json")), 201)
      } catch (error) {
        return c.json({ error: message(error) }, 400)
      }
    })

    .delete("/:id", (c) => {
      const id = c.req.param("id")
      if (!service.remove(id)) {
        return c.json({ error: `unknown knowledge base: ${id}` }, 404)
      }
      return c.json({ ok: true })
    })

    /** POST /:id/index — SSE stream: `progress` per file, then `done` or `error`. */
    .post("/:id/index", (c) => {
      const id = c.req.param("id")
      return streamSSE(c, async (stream) => {
        const controller = new AbortController()
        c.req.raw.signal.addEventListener("abort", () => controller.abort())
        try {
          const stats = await service.index(id, {
            onProgress: (progress) => {
              void stream.writeSSE({ event: "progress", data: JSON.stringify(progress) })
            },
            signal: controller.signal,
          })
          await stream.writeSSE({ event: "done", data: JSON.stringify(stats) })
        } catch (error) {
          await stream.writeSSE({ event: "error", data: JSON.stringify({ message: message(error) }) })
        }
      })
    })

    .post("/:id/search", zValidator("json", KnowledgeSearchRequestSchema, validationHook), async (c) => {
      const id = c.req.param("id")
      const { query, topK } = c.req.valid("json")
      try {
        return c.json(await service.search(id, query, topK ?? 6))
      } catch (error) {
        return c.json({ error: message(error) }, 400)
      }
    })
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
