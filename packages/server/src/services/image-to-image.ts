import { OnnxImageToImageEngine } from "@nyx/llm"
import type { EncodedImage } from "@nyx/llm"

/**
 * Image-to-image inference. Engines are cached per model id so weights load
 * once per process.
 */
const imageEngines = new Map<string, OnnxImageToImageEngine>()

export async function runImageToImage(modelId: string, input: { data: string; mimeType: string }): Promise<EncodedImage> {
  let engine = imageEngines.get(modelId)
  if (!engine) {
    engine = new OnnxImageToImageEngine({ model: modelId })
    imageEngines.set(modelId, engine)
  }
  return engine.generateEncoded(input)
}
