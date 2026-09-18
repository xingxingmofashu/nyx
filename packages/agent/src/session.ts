import { z } from "zod/v4"
import { Global } from "@nyx/global"

export type ChatSession = Global.ChatSession
export type ChatSessionMeta = Global.ChatSessionMeta

export const SessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/)

export const WorkspaceQuerySchema = z.object({
  workspaceDir: z.string().optional(),
})

export const SessionSaveRequestSchema = z.object({
  workspaceDir: z.string(),
  id: SessionIdSchema,
  title: z.string(),
  messages: z.array(z.unknown()),
})
export type SessionSaveRequest = z.infer<typeof SessionSaveRequestSchema>

export const SessionPatchRequestSchema = z.object({
  workspaceDir: z.string(),
  title: z.string().optional(),
  pinned: z.boolean().optional(),
})
export type SessionPatchRequest = z.infer<typeof SessionPatchRequestSchema>

export const ActiveSessionRequestSchema = z.object({
  workspaceDir: z.string(),
  id: SessionIdSchema.nullable(),
})
export type ActiveSessionRequest = z.infer<typeof ActiveSessionRequestSchema>
