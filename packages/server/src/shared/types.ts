/** Wire types for the nyx inference server HTTP API (shared server/client). */

import type { LlmTask } from "@nyx/llm"

export type { LlmTask }

// --- Image-to-image ---

export interface ImageInput {
  /** base64-encoded image bytes. */
  data: string
  mimeType: string
}

export interface ImagePayload {
  /** Raw encoded image bytes (png/jpeg/webp). */
  data: Uint8Array
  mimeType: string
}

export interface ImageResult {
  data: Uint8Array
  mimeType: string
  width: number
  height: number
}

// --- Models ---

/** Local tasks the inference server exposes. Single source of truth: @nyx/llm. */
export type ModelTask = LlmTask

/** Installed model as reported by /v1/models. */
export interface ModelInfo {
  id: string
  name: string
  task: string
  dtype?: string
  createdAt?: string
}

// --- Text generation ---

/** Chat roles understood by the text-generation endpoint. */
export type ChatRole = "system" | "user" | "assistant"

/**
 * One turn of conversation history.
 *
 * Transcript contract enforced by the server's stateless text-generation turn:
 * the transcript must end in a `user` message — that is the prompt the model
 * answers — and `system` content is honored only as a leading prefix (each
 * `system` message seeds the engine's system prompt, in order; a `system`
 * message placed after the first `user` is ignored). Message bodies are plain
 * text only.
 */
export interface ChatMessage {
  role: ChatRole
  content: string
}
