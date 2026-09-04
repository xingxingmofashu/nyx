import { RawImage } from "@huggingface/transformers"
import { OnnxImageToImageProvider } from "@nyx/llm"

/**
 * Image-to-image inference. Providers are cached per model id so weights
 * load once per process.
 */
const providers = new Map<string, OnnxImageToImageProvider>()

export interface ImageToImageStreamResult {
  /** Raw RGBA/RGB pixels of the output image, ready to stream. */
  data: Buffer
  width: number
  height: number
  channels: number
}

export async function stream(
  modelId: string,
  input: { data: string; mimeType: string },
): Promise<ImageToImageStreamResult> {
  let provider = providers.get(modelId)
  if (!provider) {
    provider = new OnnxImageToImageProvider({ model: modelId })
    providers.set(modelId, provider)
  }

  const bytes = Buffer.from(input.data, "base64")
  const source = await RawImage.fromBlob(new Blob([bytes], { type: input.mimeType }))
  const output = await provider.generate(source)

  const data = await output.toSharp().toBuffer()
  return {
    data,
    width: output.width,
    height: output.height,
    channels: output.channels,
  }
}
