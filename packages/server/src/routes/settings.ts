import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { z } from "zod/v4"
import { Global } from "@nyx/global"
import { Errors } from "../errors.ts"

export class Settings {
  private static readonly environmentRoute = createRoute({
    method: "get",
    path: "/environment",
    responses: {
      200: {
        content: {
          "application/json": { schema: z.object({ modelsDir: z.string(), knowledgeDir: z.string() }) },
        },
        description: "Local models and knowledge directories",
      },
    },
  })

  private static readonly readRoute = createRoute({
    method: "get",
    path: "/",
    responses: {
      200: {
        content: { "application/json": { schema: Global.SettingsSchema } },
        description: "Current settings",
      },
    },
  })

  private static readonly patchRoute = createRoute({
    method: "patch",
    path: "/",
    request: {
      body: { content: { "application/json": { schema: Global.SettingsSchema } }, required: true },
    },
    responses: {
      200: {
        content: { "application/json": { schema: Global.SettingsSchema } },
        description: "Settings merged with the patch",
      },
    },
  })

  private static readonly putRoute = createRoute({
    method: "put",
    path: "/",
    request: {
      body: { content: { "application/json": { schema: Global.SettingsSchema } }, required: true },
    },
    responses: {
      200: {
        content: { "application/json": { schema: Global.SettingsSchema } },
        description: "Settings replaced wholesale",
      },
    },
  })

  static create() {
    return new OpenAPIHono({ defaultHook: Errors.hook })
      .openapi(Settings.readRoute, async (c) => c.json(await Global.Settings.read(), 200))
      .openapi(Settings.patchRoute, async (c) => c.json(await Global.Settings.update(c.req.valid("json")), 200))
      .openapi(Settings.putRoute, async (c) => c.json(await Global.Settings.replace(c.req.valid("json")), 200))
      .openapi(Settings.environmentRoute, (c) =>
        c.json({ modelsDir: Global.Path.models, knowledgeDir: Global.Path.knowledge }, 200),
      )
  }
}
