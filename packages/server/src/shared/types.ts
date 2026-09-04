/** Wire types for the nyx inference server HTTP API (shared server/client). */

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

/**
 * Transcript contract: `{ role, content }` turns fed straight to the
 * transformers.js pipeline (chat template applied internally). Each request
 * carries the full transcript; no session is stored server-side.
 */
export type { LLMMessage } from "@nyx/llm"
