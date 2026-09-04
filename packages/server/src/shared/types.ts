/** Wire types for the nyx inference server HTTP API (shared server/client). */

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

// --- Text generation ---

/**
 * Transcript contract: plain-text `{ role, content }` turns (`LLMMessage`),
 * fed straight to the transformers.js text pipeline, which applies the
 * model's chat template to the whole array (so system messages should lead,
 * and the final user message is the prompt the model answers). No session is
 * stored server-side — each request carries the full transcript.
 */
export type { LLMMessage } from "@nyx/llm"
