import type { ImageToImagePipeline, RawImage } from "@huggingface/transformers";
import { loadPipeline } from "../runtime.ts";

export interface ImageToImageOptions {
  model: string;
  cacheDir?: string;
  allowDownload?: boolean;
}

export type ImageSource = string | RawImage;

export class OnnxImageToImageEngine {
  private readonly model: string;
  private readonly cacheDir?: string;
  private readonly allowDownload?: boolean;

  constructor(options: ImageToImageOptions) {
    this.model = options.model;
    this.cacheDir = options.cacheDir;
    this.allowDownload = options.allowDownload;
  }

  /** Run the image-to-image model on a single image; returns the output image. */
  async generate(input: ImageSource): Promise<RawImage> {
    const pipe = await this.load();
    const output = await pipe(input);
    return Array.isArray(output) ? output[0]! : output;
  }

  /** Run the model and save the output to the given path. */
  async generateToFile(input: ImageSource, outputPath: string): Promise<RawImage> {
    const image = await this.generate(input);
    await image.save(outputPath);
    return image;
  }

  private async load(): Promise<ImageToImagePipeline> {
    // swin2sr-style super-resolution models require fp32 weights.
    return loadPipeline<ImageToImagePipeline>("image-to-image", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: "fp32",
    });
  }
}
