import { RawImage, type DataType, type ImageToImagePipeline } from "@huggingface/transformers"
import { Runtime } from "../runtime.ts"
import { Model, type LLMProvider } from "../model.ts"

export type ImageSource = string | RawImage

export interface ImageProvider extends LLMProvider {
  readonly task: "image-to-image"
  generate(input: ImageSource): Promise<RawImage>
}

export interface OnnxImageToImageOptions {
  model: string
  cacheDir?: string
  dtype?: DataType
  allowDownload?: boolean
}

export class OnnxImageToImageProvider implements ImageProvider {
  readonly id = "local-onnx"
  readonly task = "image-to-image" as const
  readonly model: string
  private dtype?: DataType
  private readonly cacheDir?: string
  private readonly allowDownload?: boolean

  constructor(options: OnnxImageToImageOptions) {
    this.model = options.model
    this.dtype = options.dtype
    this.cacheDir = options.cacheDir
    this.allowDownload = options.allowDownload
  }

  async generate(input: ImageSource): Promise<RawImage> {
    const pipe = await this.load()
    const output = await pipe(input)
    return Array.isArray(output) ? output[0]! : output
  }

  private async load(): Promise<ImageToImagePipeline> {
    if (this.dtype === undefined) this.dtype = (await Model.find(this.model))?.dtype
    return Runtime.pipeline<ImageToImagePipeline>("image-to-image", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: this.dtype,
    })
  }
}
