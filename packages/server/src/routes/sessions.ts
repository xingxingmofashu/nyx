import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { Agent } from "@nyx/agent"
import { Global } from "@nyx/global"
import { Errors } from "../errors.ts"

export class Sessions {
  static create() {
    return new Hono()
      .get("/", zValidator("query", Agent.WorkspaceQuerySchema, Errors.hook), async (c) =>
        c.json(await Global.Session.list(c.req.valid("query").workspaceDir)),
      )

      .get("/active", zValidator("query", Agent.WorkspaceQuerySchema, Errors.hook), async (c) => {
        const { workspaceDir } = c.req.valid("query")
        if (workspaceDir === undefined) return c.json(null)
        return c.json((await Global.Session.activeId(workspaceDir)) ?? null)
      })

      .put("/active", zValidator("json", Agent.ActiveSessionRequestSchema, Errors.hook), async (c) => {
        const { workspaceDir, id } = c.req.valid("json")
        await Global.Session.setActiveId(workspaceDir, id)
        return c.json({ ok: true })
      })

      .get("/:id", zValidator("query", Agent.WorkspaceQuerySchema, Errors.hook), async (c) => {
        const { workspaceDir } = c.req.valid("query")
        if (workspaceDir === undefined) return c.json(null)
        return c.json((await Global.Session.read(workspaceDir, c.req.param("id"))) ?? null)
      })

      .put("/", zValidator("json", Agent.SessionSaveRequestSchema, Errors.hook), async (c) =>
        c.json(await Global.Session.save(c.req.valid("json"))),
      )

      .patch("/:id", zValidator("json", Agent.SessionPatchRequestSchema, Errors.hook), async (c) => {
        const { workspaceDir, title, pinned } = c.req.valid("json")
        const id = c.req.param("id")
        const renamed = title === undefined ? undefined : await Global.Session.rename(workspaceDir, id, title)
        const pinnedMeta = pinned === undefined ? undefined : await Global.Session.setPinned(workspaceDir, id, pinned)
        return c.json(renamed ?? pinnedMeta ?? null)
      })

      .delete("/:id", zValidator("query", Agent.WorkspaceQuerySchema, Errors.hook), async (c) => {
        const { workspaceDir } = c.req.valid("query")
        if (workspaceDir !== undefined) await Global.Session.remove(workspaceDir, c.req.param("id"))
        return c.json({ ok: true })
      })
  }
}
