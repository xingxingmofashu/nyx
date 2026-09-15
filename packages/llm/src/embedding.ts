import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  EmbeddingModelV4Result,
} from "@ai-sdk/provider";
import { OnnxEmbeddingProvider, type OnnxEmbeddingOptions } from "./tasks/feature-extraction.ts";

export interface OnnxEmbeddingModelOptions extends OnnxEmbeddingOptions {
  /** `"query"` for search queries, `"passage"` for stored content (E5 prefixes). */
  type?: "query" | "passage";
}

/**
 * Wrap a local ONNX embedding model as an AI SDK `EmbeddingModel`, so callers
 * can use `embed`/`embedMany` from `ai` with no cloud provider.
 */
export function createOnnxEmbeddingModel(options: OnnxEmbeddingModelOptions): EmbeddingModelV4 {
  const provider = new OnnxEmbeddingProvider(options);
  return {
    specificationVersion: "v4",
    provider: "nyx-local",
    modelId: options.model,
    maxEmbeddingsPerCall: 16,
    // Local CPU inference: serialize batches instead of running them in parallel.
    supportsParallelCalls: false,
    async doEmbed({ values, abortSignal }: EmbeddingModelV4CallOptions): Promise<EmbeddingModelV4Result> {
      const embeddings = await provider.embed(values, {
        type: options.type ?? "passage",
        ...(abortSignal ? { signal: abortSignal } : {}),
      });
      return {
        embeddings: embeddings.map((vector) => Array.from(vector)),
        warnings: [],
      };
    },
  };
}
