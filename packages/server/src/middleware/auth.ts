import type { MiddlewareHandler } from "hono"

export class Auth {
  static middleware(token: string): MiddlewareHandler {
    return async (c, next) => {
      if (c.req.header("authorization") !== `Bearer ${token}`) {
        return c.json({ error: "unauthorized" }, 401)
      }
      await next()
    }
  }
}
