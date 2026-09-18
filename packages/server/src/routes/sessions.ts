import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { z } from "zod/v4"
import { Agent } from "@nyx/agent"
import { Global } from "@nyx/global"
import { Errors } from "../errors.ts"
import { OkSchema } from "../responses.ts"

export class Sessions {
  private static readonly idParams = z.object({ id: z.string() })

  private static readonly listRoute = createRoute({
    method: "get",
    path: "/",
    request: { query: Agent.WorkspaceQuerySchema },
    responses: {
      200: {
        content: { "application/json": { schema: z.array(Global.ChatSessionMetaSchema) } },
        description: "Sessions of the workspace, newest first",
      },
    },
  })

  private static readonly activeGetRoute = createRoute({
    method: "get",
    path: "/active",
    request: { query: Agent.WorkspaceQuerySchema },
    responses: {
      200: {
        content: { "application/json": { schema: z.string().nullable() } },
        description: "Last opened session id",
      },
    },
  })

  private static readonly activePutRoute = createRoute({
    method: "put",
    path: "/active",
    request: {
      body: { content: { "application/json": { schema: Agent.ActiveSessionRequestSchema } }, required: true },
    },
    responses: {
      200: {
        content: { "application/json": { schema: OkSchema } },
        description: "Active session updated",
      },
    },
  })

  private static readonly readRoute = createRoute({
    method: "get",
    path: "/{id}",
    request: { params: Sessions.idParams, query: Agent.WorkspaceQuerySchema },
    responses: {
      200: {
        content: { "application/json": { schema: Global.ChatSessionSchema.nullable() } },
        description: "Session with its transcript",
      },
    },
  })

  private static readonly saveRoute = createRoute({
    method: "put",
    path: "/",
    request: {
      body: { content: { "application/json": { schema: Agent.SessionSaveRequestSchema } }, required: true },
    },
    responses: {
      200: {
        content: { "application/json": { schema: Global.ChatSessionMetaSchema } },
        description: "Saved session metadata",
      },
    },
  })

  private static readonly patchRoute = createRoute({
    method: "patch",
    path: "/{id}",
    request: {
      params: Sessions.idParams,
      body: { content: { "application/json": { schema: Agent.SessionPatchRequestSchema } }, required: true },
    },
    responses: {
      200: {
        content: { "application/json": { schema: Global.ChatSessionMetaSchema.nullable() } },
        description: "Updated session metadata",
      },
    },
  })

  private static readonly deleteRoute = createRoute({
    method: "delete",
    path: "/{id}",
    request: { params: Sessions.idParams, query: Agent.WorkspaceQuerySchema },
    responses: {
      200: {
        content: { "application/json": { schema: OkSchema } },
        description: "Session removed",
      },
    },
  })

  static create() {
    return new OpenAPIHono({ defaultHook: Errors.hook })
      .openapi(Sessions.listRoute, async (c) =>
        c.json(await Global.Session.list(c.req.valid("query").workspaceDir), 200),
      )
      .openapi(Sessions.activeGetRoute, async (c) => {
        const { workspaceDir } = c.req.valid("query")
        if (workspaceDir === undefined) return c.json(null, 200)
        return c.json((await Global.Session.activeId(workspaceDir)) ?? null, 200)
      })
      .openapi(Sessions.activePutRoute, async (c) => {
        const { workspaceDir, id } = c.req.valid("json")
        await Global.Session.setActiveId(workspaceDir, id)
        return c.json({ ok: true }, 200)
      })
      .openapi(Sessions.readRoute, async (c) => {
        const { workspaceDir } = c.req.valid("query")
        if (workspaceDir === undefined) return c.json(null, 200)
        return c.json((await Global.Session.read(workspaceDir, c.req.param("id"))) ?? null, 200)
      })
      .openapi(Sessions.saveRoute, async (c) => c.json(await Global.Session.save(c.req.valid("json")), 200))
      .openapi(Sessions.patchRoute, async (c) => {
        const { workspaceDir, title, pinned } = c.req.valid("json")
        const id = c.req.param("id")
        const renamed = title === undefined ? undefined : await Global.Session.rename(workspaceDir, id, title)
        const pinnedMeta = pinned === undefined ? undefined : await Global.Session.setPinned(workspaceDir, id, pinned)
        return c.json(renamed ?? pinnedMeta ?? null, 200)
      })
      .openapi(Sessions.deleteRoute, async (c) => {
        const { workspaceDir } = c.req.valid("query")
        if (workspaceDir !== undefined) await Global.Session.remove(workspaceDir, c.req.param("id"))
        return c.json({ ok: true }, 200)
      })
  }
}
