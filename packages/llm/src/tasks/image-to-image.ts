import { RawImage, type DataType, type ImageToImagePipeline } from "@huggingface/transformers";
import { loadPipeline } from "../runtime.ts";
import { findModel } from "../model.ts";
import type { ImageProvider, ImageSource } from "../types.ts";

export interface OnnxImageToImageOptions {
  model: string;
  cacheDir?: string;
  /** Override the dtype recorded at pull time. When omitted, the pulled dtype (or the transformers.js default) is used. */
  dtype?: DataType;
  allowDownload?: boolean;
}

export class OnnxImageToImageProvider implements ImageProvider {
  readonly id = "local-onnx";
  readonly task = "image-to-image" as const;
  readonly model: string;
  private dtype?: DataType;
  private readonly cacheDir?: string;
  private readonly allowDownload?: boolean;

  constructor(options: OnnxImageToImageOptions) {
    this.model = options.model;
    this.dtype = options.dtype;
    this.cacheDir = options.cacheDir;
    this.allowDownload = options.allowDownload;
  }

  /** Transform one image; returns the output image. */
  async generate(input: ImageSource): Promise<RawImage> {
    const pipe = await this.load();
    const output = await pipe(input);
    return Array.isArray(output) ? output[0]! : output;
  }

  private async load(): Promise<ImageToImagePipeline> {
    if (this.dtype === undefined) this.dtype = (await findModel(this.model))?.dtype;
    return loadPipeline<ImageToImagePipeline>("image-to-image", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: this.dtype,
    });
  }
}
