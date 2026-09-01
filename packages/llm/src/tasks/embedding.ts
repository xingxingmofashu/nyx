/**
 * Embedding engine — text → vector, fully local.
 *
 * Uses a small multilingual ONNX embedding model (bge-small-zh-v1.5) so
 * Chinese + English text both work. Loads through the shared runtime.
 */

import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import { loadPipeline } from "../runtime.ts";

/** Default multilingual embedding model. ~90MB, good zh+en coverage. */
export const DEFAULT_EMBEDDING_MODEL = "Xenova/bge-small-zh-v1.5";

export interface EmbeddingOptions {
  model?: string;
  cacheDir?: string;
  allowDownload?: boolean;
}

export interface EmbeddingResult {
  /** Normalized embedding vector (unit length). */
  vector: number[];
  /** Dimensionality of the embedding. */
  dim: number;
}

export class OnnxEmbeddingEngine {
  private readonly model: string;
  private readonly cacheDir?: string;
  private readonly allowDownload?: boolean;

  constructor(options: EmbeddingOptions = {}) {
    this.model = options.model ?? DEFAULT_EMBEDDING_MODEL;
    this.cacheDir = options.cacheDir;
    this.allowDownload = options.allowDownload;
  }

  /** Embed a single text into a normalized vector. */
  async embed(text: string): Promise<EmbeddingResult> {
    const pipe = await this.load();
    const output = await pipe(text, {
      pooling: "mean",
      normalize: true,
    });
    const vector = Array.from(output.data as Float32Array);
    return { vector, dim: vector.length };
  }

  /** Embed many texts into normalized vectors (batched). */
  async embedMany(texts: string[]): Promise<EmbeddingResult[]> {
    const pipe = await this.load();
    const results = await Promise.all(
      texts.map(async (t) => {
        const output = await pipe(t, { pooling: "mean", normalize: true });
        const vector = Array.from(output.data as Float32Array);
        return { vector, dim: vector.length };
      }),
    );
    return results;
  }

  private async load(): Promise<FeatureExtractionPipeline> {
    return loadPipeline<FeatureExtractionPipeline>("feature-extraction", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: "fp32",
    });
  }
}

/** Cosine similarity between two normalized vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}
