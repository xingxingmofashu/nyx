import type { MiddlewareHandler } from "hono"

/** Bearer-token auth for local access (spawned by the desktop app). */
export function auth(token: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("authorization")
    if (header !== `Bearer ${token}`) {
      return c.json({ error: "unauthorized" }, 401)
    }
    await next()
  }
}
