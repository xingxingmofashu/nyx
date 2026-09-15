import type { Hook } from "@hono/zod-validator"

/**
 * Shared `zValidator` failure hook. Responds `{ error: string }` (the server's
 * error shape) instead of the validator's default `{ success: false, error }`,
 * whose `error` is an object and surfaces as `[object Object]` to clients.
 */
export const validationHook: Hook<any, any, any, any, any, any> = (result, c) => {
  if (result.success) return
  const message = result.error.issues
    .map((issue) => {
      const path = issue.path.map((segment) => String(segment)).join(".")
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join("; ")
  return c.json({ error: message || "invalid request" }, 400)
}
