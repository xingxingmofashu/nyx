import { TextStreamer, type DataType, type TextGenerationPipeline } from "@huggingface/transformers";
import { loadPipeline } from "../runtime.ts";
import { find } from "../models.ts";
import type { LLMMessage, TextProvider, LLMEvent, StreamOptions } from "../types.ts";

export interface OnnxTextGenerationOptions {
  model: string;
  cacheDir?: string;
  /** Max tokens to generate per call. Default 512. */
  maxTokens?: number;
  /** Override the dtype recorded at pull time. When omitted, the pulled dtype (or the transformers.js default) is used. */
  dtype?: DataType;
  allowDownload?: boolean;
}

export class OnnxTextGenerationProvider implements TextProvider {
  readonly id = "local-onnx";
  readonly task = "text-generation" as const;
  readonly model: string;
  private maxTokens: number;
  private readonly dtype?: DataType;
  private cacheDir?: string;
  private allowDownload?: boolean;

  constructor(options: OnnxTextGenerationOptions) {
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 512;
    // Default to the dtype recorded when the model was pulled, so inference
    // matches what's cached instead of re-downloading another variant.
    this.dtype = options.dtype ?? find(options.model)?.dtype;
    this.cacheDir = options.cacheDir;
    this.allowDownload = options.allowDownload;
  }

  async *stream(
    messages: LLMMessage[],
    options: StreamOptions = {},
  ): AsyncIterable<LLMEvent> {
    const pipe = await this.load();
    const maxTokens = options.maxTokens ?? this.maxTokens;

    // Bridge the synchronous TextStreamer callback to the async generator.
    let buffer: string[] = [];
    let waiter: (() => void) | undefined;
    let done = false;
    let error: Error | undefined;

    const wake = () => {
      waiter?.();
      waiter = undefined;
    };

    const streamer = new TextStreamer(pipe.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text) => {
        buffer.push(text);
        wake();
      },
    });

    void pipe(messages, {
      max_new_tokens: maxTokens,
      do_sample: true,
      temperature: options.temperature ?? 0.7,
      streamer,
    }).then(
      () => {
        done = true;
        wake();
      },
      (err: unknown) => {
        error = err instanceof Error ? err : new Error(String(err));
        done = true;
        wake();
      },
    );

    for (;;) {
      while (buffer.length > 0) {
        const chunk = buffer.shift()!;
        if (chunk) yield { type: "text-delta", delta: chunk };
      }
      if (done) break;
      await new Promise<void>((resolve) => {
        waiter = resolve;
      });
    }

    if (error) yield { type: "error", message: error.message };
  }

  private async load(): Promise<TextGenerationPipeline> {
    return loadPipeline<TextGenerationPipeline>("text-generation", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: this.dtype,
    });
  }
}
