/**
 * Local chat provider — text → text, fully local.
 *
 * Runs a small ONNX instruct model (Qwen2.5-0.5B-Instruct) via the shared
 * runtime. No cloud, no API keys.
 */

import type { TextGenerationPipeline } from "@huggingface/transformers";
import { loadPipeline } from "../runtime.ts";
import type { LLMMessage, LLMProvider, LLMEvent, StreamOptions } from "../types.ts";

export const DEFAULT_LOCAL_LLM = "onnx-community/Qwen2.5-0.5B-Instruct";

export interface OnnxLLMOptions {
  model?: string;
  cacheDir?: string;
  /** Max tokens to generate per call. Default 512. */
  maxTokens?: number;
  /** Quantization dtype. Default "q4" for speed/size. */
  dtype?: "fp32" | "fp16" | "q8" | "q4";
  allowDownload?: boolean;
}

/** Chat template helper for Qwen2.5-style models. */
function applyChatTemplate(messages: LLMMessage[]): string {
  const lines = messages.map((m) => {
    switch (m.role) {
      case "system":
        return `<|im_start|>system\n${m.content}<|im_end|>`;
      case "user":
        return `<|im_start|>user\n${m.content}<|im_end|>`;
      case "assistant":
        return `<|im_start|>assistant\n${m.content}<|im_end|>`;
    }
  });
  return lines.join("\n") + "\n<|im_start|>assistant\n";
}

export class OnnxLLMProvider implements LLMProvider {
  readonly id = "local-onnx";
  readonly model: string;
  private maxTokens: number;
  private dtype: NonNullable<OnnxLLMOptions["dtype"]>;
  private cacheDir?: string;
  private allowDownload?: boolean;

  constructor(options: OnnxLLMOptions = {}) {
    this.model = options.model ?? DEFAULT_LOCAL_LLM;
    this.maxTokens = options.maxTokens ?? 512;
    this.dtype = options.dtype ?? "q4";
    this.cacheDir = options.cacheDir;
    this.allowDownload = options.allowDownload;
  }

  async *stream(
    messages: LLMMessage[],
    options: StreamOptions = {},
  ): AsyncIterable<LLMEvent> {
    const pipe = await this.load();
    const prompt = applyChatTemplate(messages);
    const maxTokens = options.maxTokens ?? this.maxTokens;

    try {
      const output = await pipe(prompt, {
        max_new_tokens: maxTokens,
        do_sample: true,
        temperature: options.temperature ?? 0.7,
        return_full_text: false,
      });

      // With return_full_text:false, generated_text is only the completion.
      const text = Array.isArray(output)
        ? (output[0] as { generated_text?: string })?.generated_text ?? ""
        : String(output);

      const completion = text.trim();
      if (completion) {
        // Emit in chunks so the CLI / server can render progressively.
        const chunkSize = 8;
        for (let i = 0; i < completion.length; i += chunkSize) {
          yield { type: "text-delta", delta: completion.slice(i, i + chunkSize) };
        }
      }
    } catch (error) {
      yield {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async load(): Promise<TextGenerationPipeline> {
    return loadPipeline<TextGenerationPipeline>("text-generation", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: this.dtype,
    });
  }
}
