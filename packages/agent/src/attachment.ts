import type { UIMessage } from "ai"
import { z } from "zod/v4"
import { SessionIdSchema } from "./session.ts"
import type { ContextCheckpoint, TokenUsage } from "./compaction.ts"

export const SavedAttachmentSchema = z.object({
  path: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
})
export type SavedAttachment = z.infer<typeof SavedAttachmentSchema>

export const GeneratedFileQuerySchema = z.object({
  path: z.string().min(1),
  workspaceDir: z.string().min(1).optional(),
})
export type GeneratedFileQuery = z.infer<typeof GeneratedFileQuerySchema>

export const AttachmentSaveRequestSchema = z.object({
  workspaceDir: z.string().min(1),
  sessionId: SessionIdSchema,
  name: z.string(),
  mimeType: z.string(),
  data: z.string(),
})
export type AttachmentSaveRequest = z.infer<typeof AttachmentSaveRequestSchema>

export interface ChatMessageMetadata {
  attachments?: SavedAttachment[]
  compaction?: ContextCheckpoint
  usage?: TokenUsage
  contextLimit?: number
  compactionSkipped?: "too-short"
}

export class Attachment {
  static annotate(messages: UIMessage[]): UIMessage[] {
    return messages.map((message) => {
      if (message.role !== "user") return message
      const attachments = (message.metadata as ChatMessageMetadata | undefined)?.attachments
      if (!attachments || attachments.length === 0) return message

      const note = attachments
        .map(
          (attachment) =>
            `[Attached file: ${attachment.path} (${attachment.mimeType}, ${attachment.size} bytes). ` +
            "Pass this path as `inputPath` to local_image_to_image.]",
        )
        .join("\n")

      return { ...message, parts: [...message.parts, { type: "text" as const, text: `\n\n${note}` }] }
    })
  }
}
