import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import { Agent } from "@nyx/agent"
import { Errors } from "../errors.ts"

export class Knowledge {
  static create(service: Agent.Services.Knowledge) {
    return new Hono()
      .get("/", async (c) => c.json(await service.status()))

      .get("/documents", async (c) => c.json(await service.list()))

      .get(
        "/document",
        zValidator("query", Agent.Services.KnowledgeReadQuerySchema, Errors.hook),
        async (c) => {
          const { path } = c.req.valid("query")
          try {
            return c.json({ path, content: await service.read(path) })
          } catch (error) {
            throw Errors.status(404, error)
          }
        },
      )

      .post(
        "/documents",
        zValidator("json", Agent.Services.KnowledgeImportRequestSchema, Errors.hook),
        async (c) => {
          const { documents, overwrite } = c.req.valid("json")
          try {
            return c.json(await service.importDocuments(documents, overwrite ?? false))
          } catch (error) {
            throw Errors.status(400, error)
          }
        },
      )

      .delete(
        "/documents",
        zValidator("json", Agent.Services.KnowledgeDeleteRequestSchema, Errors.hook),
        async (c) => {
          try {
            await service.removeDocument(c.req.valid("json").path)
            return c.json({ ok: true })
          } catch (error) {
            throw Errors.status(400, error)
          }
        },
      )

      .post(
        "/build",
        zValidator("json", Agent.Services.KnowledgeIndexRequestSchema, Errors.hook),
        (c) => {
          const rebuild = c.req.valid("json").rebuild === true
          let controller: AbortController
          try {
            controller = service.beginIndex()
          } catch (error) {
            throw Errors.status(409, error)
          }
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
              const aborted = controller.signal.aborted
              await stream.writeSSE({
                event: aborted ? "cancelled" : "error",
                data: JSON.stringify(aborted ? {} : { message: Errors.message(error) }),
              })
            } finally {
              service.endIndex()
            }
          })
        },
      )

      .post("/build/cancel", (c) => c.json({ cancelled: service.cancelIndex() }))

      .post(
        "/search",
        zValidator("json", Agent.Services.KnowledgeSearchRequestSchema, Errors.hook),
        async (c) => {
          const { query, topK } = c.req.valid("json")
          try {
            return c.json(await service.search(query, topK ?? 6))
          } catch (error) {
            throw Errors.status(400, error)
          }
        },
      )
  }
}
