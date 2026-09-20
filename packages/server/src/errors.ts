import type { Hook } from "@hono/zod-openapi"
import type { Env } from "hono"
import { HTTPException } from "hono/http-exception"

export class Errors {
  static readonly hook = ((result, c) => {
    if (result.success) return
    const message = result.error.issues
      .map((issue) => {
        const path = issue.path.map((segment) => String(segment)).join(".")
        return path ? `${path}: ${issue.message}` : issue.message
      })
      .join("; ")
    return c.json({ error: message || "invalid request" }, 400)
  }) satisfies Hook<unknown, Env, string, Response | void>

  static message(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  static status(status: ConstructorParameters<typeof HTTPException>[0], error: unknown): HTTPException {
    return new HTTPException(status, { message: Errors.message(error) })
  }
}
