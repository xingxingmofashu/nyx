/** Wire types for the nyx inference server HTTP API (shared server/client). */

import type { LLMMessage, LlmTask } from "@nyx/llm"

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

/**
 * One message of conversation history sent over the wire.
 *
 * Transcript contract: plain-text `{ role, content }` turns, fed straight to
 * the transformers.js text pipeline, which applies the model's chat template
 * to the whole array (so system messages should lead, and the final user
 * message is the prompt the model answers). No session is stored server-side —
 * each request carries the full transcript.
 */
export type ChatMessage = LLMMessage
