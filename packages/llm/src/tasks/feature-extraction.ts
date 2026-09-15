import type { DataType, FeatureExtractionPipeline, Tensor } from "@huggingface/transformers";
import { loadPipeline } from "../runtime.ts";
import { find } from "../models.ts";
import type { EmbeddingOptions, EmbeddingProvider } from "../types.ts";

export interface OnnxEmbeddingOptions {
  model: string;
  cacheDir?: string;
  /** Override the dtype recorded at pull time. When omitted, the pulled dtype (or the transformers.js default) is used. */
  dtype?: DataType;
  allowDownload?: boolean;
}

export class OnnxEmbeddingProvider implements EmbeddingProvider {
  readonly id = "local-onnx";
  readonly task = "feature-extraction" as const;
  readonly model: string;
  private readonly dtype?: DataType;
  private readonly cacheDir?: string;
  private readonly allowDownload?: boolean;

  constructor(options: OnnxEmbeddingOptions) {
    this.model = options.model;
    // Default to the dtype recorded when the model was pulled, so inference
    // matches what's cached instead of re-downloading another variant.
    this.dtype = options.dtype ?? find(options.model)?.dtype;
    this.cacheDir = options.cacheDir;
    this.allowDownload = options.allowDownload;
  }

  /** Embed `texts` in order (mean-pooled and L2-normalized). */
  async embed(texts: string[], options: EmbeddingOptions = {}): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    options.signal?.throwIfAborted();
    const pipe = await this.load();
    const prefix = embeddingPrefix(this.model, options.type ?? "passage");
    const input = prefix ? texts.map((text) => `${prefix}${text}`) : texts;
    const tensor = (await pipe(input, { pooling: "mean", normalize: true })) as Tensor;
    const data = tensor.data as Float32Array;
    const dims = tensor.dims;
    const dim = dims[dims.length - 1]!;
    const output: Float32Array[] = [];
    for (let i = 0; i < texts.length; i++) {
      output.push(data.slice(i * dim, (i + 1) * dim));
    }
    return output;
  }

  private async load(): Promise<FeatureExtractionPipeline> {
    return loadPipeline<FeatureExtractionPipeline>("feature-extraction", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: this.dtype,
    });
  }
}

/**
 * E5-family models expect an asymmetric prefix (`query:` for questions,
 * `passage:` for stored content); omitting it measurably degrades retrieval.
 * Other embedding models ignore it.
 */
function embeddingPrefix(model: string, type: "query" | "passage"): string {
  if (!/(^|[/-])e5/i.test(model)) return "";
  return type === "query" ? "query: " : "passage: ";
}
