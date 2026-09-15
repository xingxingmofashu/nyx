import { RawImage } from "@huggingface/transformers"
import { OnnxImageToImageProvider } from "@nyx/llm"
import type { ImageBase64Input } from "../../schema"
import { ProviderCache } from "../../provider/cache"

/** One generated image: encoded bytes plus the pipeline's shape metadata. */
export interface GeneratedImage {
  data: Buffer
  mimeType: string
  width: number
  height: number
  channels: number
}

/** Runs image-to-image inference against cached model providers. */
export class ImageToImageService {
  constructor(private readonly cache: ProviderCache = new ProviderCache()) {}

  /** Transform a single image with an image-to-image model. */
  async generate(modelId: string, input: ImageBase64Input): Promise<GeneratedImage> {
    const provider = this.cache.get(modelId, () => new OnnxImageToImageProvider({ model: modelId }))
    const bytes = Buffer.from(input.data, "base64")
    const source = await RawImage.fromBlob(new Blob([bytes], { type: input.mimeType }))
    const output = await provider.generate(source)

    return {
      data: await output.toSharp().png().toBuffer(),
      mimeType: "image/png",
      width: output.width,
      height: output.height,
      channels: output.channels,
    }
  }
}
