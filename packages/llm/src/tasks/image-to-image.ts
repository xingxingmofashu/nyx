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
  dtype?: DataType
}

export class OnnxImageToImageProvider implements ImageProvider {
  readonly id = "local-onnx"
  readonly task = "image-to-image" as const
  readonly model: string
  private dtype?: DataType

  constructor(options: OnnxImageToImageOptions) {
    this.model = options.model
    this.dtype = options.dtype
  }

  async generate(input: ImageSource): Promise<RawImage> {
    const pipe = await this.load()
    const output = await pipe(input)
    const image = Array.isArray(output) ? output[0] : output
    if (!(image instanceof RawImage)) throw new Error("image-to-image did not return an image")
    return image
  }

  private async load(): Promise<ImageToImagePipeline> {
    if (this.dtype === undefined) this.dtype = (await Model.find(this.model))?.dtype
    return Runtime.pipeline<ImageToImagePipeline>("image-to-image", this.model, { dtype: this.dtype })
  }
}
