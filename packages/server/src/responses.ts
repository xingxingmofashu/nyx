import { z } from "zod/v4"

export const OkSchema = z.object({ ok: z.boolean() })
export type OkSchemaType = z.infer<typeof OkSchema>

export const CancelledSchema = z.object({ cancelled: z.boolean() })
export type CancelledSchemaType = z.infer<typeof CancelledSchema>

export const PullCancelledSchema = z.object({ ok: z.boolean(), cancelled: z.boolean() })
export type PullCancelledSchemaType = z.infer<typeof PullCancelledSchema>

export const ErrorSchema = z.object({ error: z.string() })
export type ErrorSchemaType = z.infer<typeof ErrorSchema>
