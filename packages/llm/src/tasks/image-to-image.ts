import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RawImage, type ImageToImagePipeline } from "@huggingface/transformers";
import { loadPipeline } from "../runtime.ts";

export interface ImageToImageOptions {
  model: string;
  cacheDir?: string;
  allowDownload?: boolean;
}

export type ImageSource = string | RawImage;

/** base64-encoded image (wire format for HTTP/IPC). */
export interface EncodedImage {
  data: string; // base64
  mimeType: string;
  width: number;
  height: number;
}

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

  /** Run the model on a base64 image, returning a base64 PNG result. */
  async generateEncoded(input: { data: string; mimeType: string }): Promise<EncodedImage> {
    const bytes = Buffer.from(input.data, "base64");
    const source = await RawImage.fromBlob(new Blob([bytes], { type: input.mimeType }));
    const output = await this.generate(source);
    return { ...(await encodePng(output)), width: output.width, height: output.height };
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

/**
 * Encode a RawImage as base64 PNG. RawImage.toBlob is browser-only, so on
 * Node we save to a temp file and read it back.
 */
export async function encodePng(image: RawImage): Promise<{ data: string; mimeType: "image/png" }> {
  const dir = mkdtempSync(join(tmpdir(), "nyx-img-"));
  const file = join(dir, "out.png");
  try {
    await image.save(file);
    return { data: readFileSync(file).toString("base64"), mimeType: "image/png" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
