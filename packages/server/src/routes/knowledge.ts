import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import {
  KnowledgeDeleteRequestSchema,
  KnowledgeImportRequestSchema,
  KnowledgeIndexRequestSchema,
  KnowledgeReadQuerySchema,
  KnowledgeSearchRequestSchema,
} from "@nyx/agent/schema"
import { validationHook } from "../validation"
import type { KnowledgeService } from "@nyx/agent"

/**
 * /v1/knowledge — manage the local knowledge base: list/read documents,
 * import (with an explicit overwrite decision), delete, rebuild the index, and
 * try a search. The index run streams progress over SSE like model pulls.
 */
export function knowledge(service: KnowledgeService) {
  return new Hono()
    .get("/", async (c) => c.json(await service.status()))

    .get("/documents", async (c) => c.json(await service.list()))

    /** One document's Markdown source, for the preview pane. */
    .get("/document", zValidator("query", KnowledgeReadQuerySchema, validationHook), async (c) => {
      try {
        return c.json({ path: c.req.valid("query").path, content: await service.read(c.req.valid("query").path) })
      } catch (error) {
        return c.json({ error: message(error) }, 404)
      }
    })

    /**
     * Import documents. `overwrite` applies to every conflict in the batch; the
     * caller asks the user first and re-posts with `overwrite: true` to replace.
     */
    .post("/documents", zValidator("json", KnowledgeImportRequestSchema, validationHook), async (c) => {
      const { documents, overwrite } = c.req.valid("json")
      try {
        return c.json(await service.importDocuments(documents, overwrite ?? false))
      } catch (error) {
        return c.json({ error: message(error) }, 400)
      }
    })

    .delete("/documents", zValidator("json", KnowledgeDeleteRequestSchema, validationHook), async (c) => {
      try {
        await service.removeDocument(c.req.valid("json").path)
        return c.json({ ok: true })
      } catch (error) {
        return c.json({ error: message(error) }, 400)
      }
    })

    /**
     * POST /build — SSE progress for an incremental update or a full rebuild.
     * Not `/index`: the Hono RPC client strips a trailing `index` segment from
     * the URL (Next.js convention), which would collide with `GET /`.
     */
    .post("/build", zValidator("json", KnowledgeIndexRequestSchema, validationHook), (c) => {
      const rebuild = c.req.valid("json").rebuild === true
      let controller: AbortController
      try {
        controller = service.beginIndex()
      } catch (error) {
        return c.json({ error: message(error) }, 409)
      }
      // A client that goes away must not leave the run going.
      c.req.raw.signal.addEventListener("abort", () => controller.abort())

      return streamSSE(c, async (stream) => {
        try {
          const stats = await service.index({
            rebuild,
            signal: controller.signal,
            onProgress: (progress) => {
              void stream.writeSSE({ event: "progress", data: JSON.stringify(progress) })
            },
          })
          await stream.writeSSE({
            event: "done",
            data: JSON.stringify({ files: stats.files, chunks: stats.chunks, skipped: stats.skipped }),
          })
        } catch (error) {
          // An aborted run and a failed one are different outcomes for the UI.
          const aborted = controller.signal.aborted
          await stream.writeSSE({
            event: aborted ? "cancelled" : "error",
            data: JSON.stringify(aborted ? {} : { message: message(error) }),
          })
        } finally {
          service.endIndex()
        }
      })
    })

    /** POST /build/cancel — stop an in-flight index run. */
    .post("/build/cancel", (c) => c.json({ cancelled: service.cancelIndex() }))

    /** POST /search — retrieval, so the page can check what the index answers. */
    .post("/search", zValidator("json", KnowledgeSearchRequestSchema, validationHook), async (c) => {
      const { query, topK } = c.req.valid("json")
      try {
        return c.json(await service.search(query, topK ?? 6))
      } catch (error) {
        return c.json({ error: message(error) }, 400)
      }
    })
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
