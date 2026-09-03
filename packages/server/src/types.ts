/** Image input for the inference server (base64 wire format). */

export interface ImageInput {
  /** base64-encoded image bytes. */
  data: string
  mimeType: string
}
