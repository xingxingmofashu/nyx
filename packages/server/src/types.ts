/** Image types for the inference server. */

export interface ImageInput {
  /** base64-encoded image bytes. */
  data: string
  mimeType: string
}

export interface ImageOutput {
  /** base64-encoded PNG bytes. */
  data: string
  mimeType: string
  width: number
  height: number
}
