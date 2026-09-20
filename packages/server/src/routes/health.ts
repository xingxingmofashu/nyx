import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { OkSchema } from "../responses.ts"

export class Health {
  private static readonly route = createRoute({
    method: "get",
    path: "/",
    responses: {
      200: {
        content: { "application/json": { schema: OkSchema } },
        description: "Server readiness",
      },
      401: { description: "Missing or invalid bearer token" },
      500: { description: "Unexpected server error" },
    },
  })

  static create() {
    return new OpenAPIHono().openapi(Health.route, (c) => c.json({ ok: true }, 200))
  }
}
