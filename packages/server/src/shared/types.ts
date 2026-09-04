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

// --- Models ---

export type ModelTask = "text-generation" | "image-to-image"

/** Installed model as reported by /v1/models. */
export interface ModelInfo {
  id: string
  name: string
  task: string
  dtype?: string
  createdAt?: string
}
