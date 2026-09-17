import type { DataType, FeatureExtractionPipeline, Tensor } from "@huggingface/transformers"
import { Runtime } from "../runtime.ts"
import { Model, type LLMProvider } from "../model.ts"

export interface EmbeddingOptions {
  type?: "query" | "passage"
  signal?: AbortSignal
}

export interface EmbeddingProvider extends LLMProvider {
  readonly task: "feature-extraction"
  embed(texts: string[], options?: EmbeddingOptions): Promise<Float32Array[]>
}

export interface OnnxFeatureExtractionOptions {
  model: string
  cacheDir?: string
  dtype?: DataType
  allowDownload?: boolean
}

export class OnnxFeatureExtractionProvider implements EmbeddingProvider {
  private static readonly BATCH_SIZE = 16

  readonly id = "local-onnx"
  readonly task = "feature-extraction" as const
  readonly model: string
  private dtype?: DataType
  private readonly cacheDir?: string
  private readonly allowDownload?: boolean

  constructor(options: OnnxFeatureExtractionOptions) {
    this.model = options.model
    this.dtype = options.dtype
    this.cacheDir = options.cacheDir
    this.allowDownload = options.allowDownload
  }

  async embed(texts: string[], options: EmbeddingOptions = {}): Promise<Float32Array[]> {
    if (texts.length === 0) return []
    const pipe = await this.load()
    const prefix = OnnxFeatureExtractionProvider.prefix(this.model, options.type ?? "passage")
    const output: Float32Array[] = []
    for (let start = 0; start < texts.length; start += OnnxFeatureExtractionProvider.BATCH_SIZE) {
      options.signal?.throwIfAborted()
      const batch = texts.slice(start, start + OnnxFeatureExtractionProvider.BATCH_SIZE)
      const input = prefix ? batch.map((text) => `${prefix}${text}`) : batch
      const tensor = (await pipe(input, { pooling: "mean", normalize: true })) as Tensor
      const data = tensor.data as Float32Array
      const dim = tensor.dims[tensor.dims.length - 1]!
      for (let i = 0; i < batch.length; i++) output.push(data.slice(i * dim, (i + 1) * dim))
    }
    return output
  }

  private async load(): Promise<FeatureExtractionPipeline> {
    if (this.dtype === undefined) this.dtype = (await Model.find(this.model))?.dtype
    return Runtime.pipeline<FeatureExtractionPipeline>("feature-extraction", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: this.dtype,
    })
  }

  private static prefix(model: string, type: "query" | "passage"): string {
    if (!/(^|[/-])e5/i.test(model)) return ""
    return type === "query" ? "query: " : "passage: "
  }
}
