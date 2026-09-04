// Chat message + content-block model for @nyx/core.
//
// Messages are the session transcript the Agent owns and renders. Content
// blocks are discriminated unions: a message carries an ordered list that
// renderers walk top-to-bottom. Blocks no consumer produces yet (thinking,
// toolCall, image) are kept so streaming those in later is additive, not a
// breaking model change.

export interface TextContent {
  type: "text"
  text: string
}

export interface ThinkingContent {
  type: "thinking"
  thinking: string
}

export interface ImageContent {
  type: "image"
  /** base64-encoded image data. */
  data: string
  /** e.g. "image/jpeg", "image/png". */
  mimeType: string
}

export interface ToolCallContent {
  type: "toolCall"
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** Blocks a user message may carry, in render order. */
export type UserContent = TextContent | ImageContent

/** Blocks an assistant message may carry, in render order. */
export type AssistantContent = TextContent | ThinkingContent | ToolCallContent

/** Every content block kind. */
export type ContentBlock = TextContent | ThinkingContent | ImageContent | ToolCallContent

export interface UserMessage {
  role: "user"
  /** Plain-text shorthand for a text-only message, or structured blocks. */
  content: string | UserContent[]
  /** Unix timestamp in milliseconds. */
  timestamp: number
}

export interface AssistantMessage {
  role: "assistant"
  content: AssistantContent[]
}

/** Any message in the transcript. */
export type Message = UserMessage | AssistantMessage
