import { RawImage } from "@huggingface/transformers"
import { OnnxImageToImageEngine } from "@nyx/llm"
import type { ImagePayload, ImageResult } from "../shared/types"

/**
 * Owns the image-to-image engine used by the image tools.
 * Uint8Array crosses the IPC boundary; RawImage stays in main.
 */
export class ImageService {
  private engine: OnnxImageToImageEngine | null = null
  private modelId: string

  constructor(modelId: string) {
    this.modelId = modelId
  }

  get currentModel(): string {
    return this.modelId
  }

  async setModel(modelId: string): Promise<void> {
    if (modelId === this.modelId && this.engine) return
    this.engine = null
    this.modelId = modelId
  }

  async run(input: ImagePayload, modelId?: string): Promise<ImageResult> {
    if (modelId && modelId !== this.modelId) {
      await this.setModel(modelId)
    }
    const engine = this.ensureEngine()
    const bytes = input.data.buffer.slice(
      input.data.byteOffset,
      input.data.byteOffset + input.data.byteLength,
    ) as ArrayBuffer
    const source = await RawImage.fromBlob(new Blob([bytes], { type: input.mimeType }))
    const output = await engine.generate(source)
    const blob = await output.toBlob("image/png")
    const data = new Uint8Array(await blob.arrayBuffer())
    return { data, mimeType: "image/png", width: output.width, height: output.height }
  }

  private ensureEngine(): OnnxImageToImageEngine {
    if (!this.modelId) {
      throw new Error("No image-to-image model selected. Pick a model first.")
    }
    if (!this.engine) {
      this.engine = new OnnxImageToImageEngine({ model: this.modelId })
    }
    return this.engine
  }
}
