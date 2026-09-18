import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { z } from "zod/v4"

const HealthSchema = z.object({ ok: z.boolean() })

export class Health {
  private static readonly route = createRoute({
    method: "get",
    path: "/",
    responses: {
      200: {
        content: { "application/json": { schema: HealthSchema } },
        description: "Server readiness",
      },
    },
  })

  static create() {
    return new OpenAPIHono().openapi(Health.route, (c) => c.json({ ok: true }, 200))
  }
}
