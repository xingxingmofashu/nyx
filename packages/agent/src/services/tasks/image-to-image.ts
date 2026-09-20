import { RawImage } from "@huggingface/transformers"
import { LLM } from "@nyx/llm"
import { z } from "zod/v4"
import { Provider } from "../../provider.ts"

export const ImageBase64InputSchema = z.object({
  data: z.string(),
  mimeType: z.string(),
})
export type ImageBase64Input = z.infer<typeof ImageBase64InputSchema>

export const ImageToImageRequestSchema = z.object({
  model: z.string().min(1),
  image: ImageBase64InputSchema,
})
export type ImageToImageRequest = z.infer<typeof ImageToImageRequestSchema>

export interface ImageBytes {
  data: Uint8Array
  mimeType: string
}

export interface ImageResult {
  data: Uint8Array
  mimeType: string
  width: number
  height: number
}

export interface GeneratedImage {
  data: Buffer
  mimeType: string
  width: number
  height: number
  channels: number
}

export class ImageToImage {
  constructor(private readonly cache: Provider = new Provider()) {}

  async generate(modelId: string, input: ImageBase64Input): Promise<GeneratedImage> {
    const provider = this.cache.get(() => new LLM.OnnxImageToImageProvider({ model: modelId }))
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
