import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { z } from "zod/v4"
import { Global } from "@nyx/global"

const EnvironmentSchema = z.object({
  modelsDir: z.string(),
  knowledgeDir: z.string(),
})

export class Environment {
  private static readonly route = createRoute({
    method: "get",
    path: "/",
    responses: {
      200: {
        content: { "application/json": { schema: EnvironmentSchema } },
        description: "Local models and knowledge directories",
      },
    },
  })

  static create() {
    return new OpenAPIHono().openapi(Environment.route, (c) =>
      c.json({ modelsDir: Global.Path.models, knowledgeDir: Global.Path.knowledge }, 200),
    )
  }
}
