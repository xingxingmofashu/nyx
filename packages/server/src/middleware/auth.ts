import { createHash, timingSafeEqual } from "node:crypto"
import type { MiddlewareHandler } from "hono"

export class Auth {
  static middleware(token: string): MiddlewareHandler {
    const expected = `Bearer ${token}`
    return async (c, next) => {
      if (!Auth.matches(c.req.header("authorization") ?? "", expected)) {
        return c.json({ error: "unauthorized" }, 401)
      }
      await next()
    }
  }

  private static matches(actual: string, expected: string): boolean {
    const a = createHash("sha256").update(actual).digest()
    const b = createHash("sha256").update(expected).digest()
    return timingSafeEqual(a, b)
  }
}
