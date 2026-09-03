import { RawImage } from "@huggingface/transformers"
import { OnnxImageToImageEngine } from "@nyx/llm"

/**
 * Image-to-image inference. Engines are cached per model id so weights load
 * once per process.
 */
const imageEngines = new Map<string, OnnxImageToImageEngine>()

export interface ImageToImageStreamResult {
  /** Raw RGBA/RGB pixels of the output image, ready to stream. */
  data: Buffer
  width: number
  height: number
  channels: number
}

export async function streamImageToImage(
  modelId: string,
  input: { data: string; mimeType: string },
): Promise<ImageToImageStreamResult> {
  let engine = imageEngines.get(modelId)
  if (!engine) {
    engine = new OnnxImageToImageEngine({ model: modelId })
    imageEngines.set(modelId, engine)
  }

  const bytes = Buffer.from(input.data, "base64")
  const source = await RawImage.fromBlob(new Blob([bytes], { type: input.mimeType }))
  const output = await engine.generate(source)

  const data =  await output.toSharp().toBuffer()
  return {
    data,
    width: output.width,
    height: output.height,
    channels: output.channels,
  }
}
