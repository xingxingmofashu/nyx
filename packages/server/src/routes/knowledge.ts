import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { streamSSE } from "hono/streaming"
import { z } from "zod/v4"
import { Agent } from "@nyx/agent"
import { Errors } from "../errors.ts"
import { CancelledSchema, OkSchema } from "../responses.ts"

export class Knowledge {
  private static readonly statusRoute = createRoute({
    method: "get",
    path: "/",
    responses: {
      200: {
        content: { "application/json": { schema: Agent.Services.KnowledgeStatusSchema } },
        description: "Knowledge index status",
      },
    },
  })

  private static readonly documentsRoute = createRoute({
    method: "get",
    path: "/documents",
    responses: {
      200: {
        content: { "application/json": { schema: z.array(Agent.Services.KnowledgeDocumentSchema) } },
        description: "Every document with its index status",
      },
    },
  })

  private static readonly documentRoute = createRoute({
    method: "get",
    path: "/document",
    request: { query: Agent.Services.KnowledgeReadQuerySchema },
    responses: {
      200: {
        content: { "application/json": { schema: z.object({ path: z.string(), content: z.string() }) } },
        description: "One document's Markdown source",
      },
    },
  })

  private static readonly importRoute = createRoute({
    method: "post",
    path: "/documents",
    request: {
      body: { content: { "application/json": { schema: Agent.Services.KnowledgeImportRequestSchema } }, required: true },
    },
    responses: {
      200: {
        content: { "application/json": { schema: Agent.Services.KnowledgeImportResultSchema } },
        description: "Which documents were written, replaced or skipped",
      },
    },
  })

  private static readonly deleteRoute = createRoute({
    method: "delete",
    path: "/documents",
    request: {
      body: { content: { "application/json": { schema: Agent.Services.KnowledgeDeleteRequestSchema } }, required: true },
    },
    responses: {
      200: {
        content: { "application/json": { schema: OkSchema } },
        description: "Document removed",
      },
    },
  })

  private static readonly buildRoute = createRoute({
    method: "post",
    path: "/build",
    request: {
      body: { content: { "application/json": { schema: Agent.Services.KnowledgeIndexRequestSchema } }, required: true },
    },
    responses: {
      200: { description: "Server-sent progress stream for the index build" },
    },
  })

  private static readonly buildCancelRoute = createRoute({
    method: "post",
    path: "/build/cancel",
    responses: {
      200: {
        content: { "application/json": { schema: CancelledSchema } },
        description: "Whether a running index build was cancelled",
      },
    },
  })

  private static readonly searchRoute = createRoute({
    method: "post",
    path: "/search",
    request: {
      body: {
        content: { "application/json": { schema: Agent.Services.KnowledgeSearchRequestSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: z.array(Agent.Services.KnowledgeSearchHitSchema) } },
        description: "Ranked retrieval hits",
      },
    },
  })

  static create(service: Agent.Services.Knowledge) {
    return new OpenAPIHono({ defaultHook: Errors.hook })
      .openapi(Knowledge.statusRoute, async (c) => c.json(await service.status(), 200))
      .openapi(Knowledge.documentsRoute, async (c) => c.json(await service.list(), 200))
      .openapi(Knowledge.documentRoute, async (c) => {
        const { path } = c.req.valid("query")
        try {
          return c.json({ path, content: await service.read(path) }, 200)
        } catch (error) {
          throw Errors.status(404, error)
        }
      })
      .openapi(Knowledge.importRoute, async (c) => {
        const { documents, overwrite } = c.req.valid("json")
        try {
          return c.json(await service.importDocuments(documents, overwrite ?? false), 200)
        } catch (error) {
          throw Errors.status(400, error)
        }
      })
      .openapi(Knowledge.deleteRoute, async (c) => {
        try {
          await service.removeDocument(c.req.valid("json").path)
          return c.json({ ok: true }, 200)
        } catch (error) {
          throw Errors.status(400, error)
        }
      })
      .openapi(Knowledge.buildRoute, (c) => {
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
      })
      .openapi(Knowledge.buildCancelRoute, (c) => c.json({ cancelled: service.cancelIndex() }, 200))
      .openapi(Knowledge.searchRoute, async (c) => {
        const { query, topK } = c.req.valid("json")
        try {
          return c.json(await service.search(query, topK ?? 6), 200)
        } catch (error) {
          throw Errors.status(400, error)
        }
      })
  }
}
