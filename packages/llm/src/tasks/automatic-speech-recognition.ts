import type { AutomaticSpeechRecognitionPipeline, DataType } from "@huggingface/transformers";
import { loadPipeline } from "../runtime.ts";
import { find } from "../models.ts";
import type { AutomaticSpeechRecognitionOptions, TranscriptionProvider } from "../types.ts";

export interface OnnxAutomaticSpeechRecognitionOptions {
  model: string;
  cacheDir?: string;
  /** Override the dtype recorded at pull time. When omitted, the pulled dtype (or the transformers.js default) is used. */
  dtype?: DataType;
  allowDownload?: boolean;
}

export class OnnxAutomaticSpeechRecognitionProvider implements TranscriptionProvider {
  readonly id = "local-onnx";
  readonly task = "automatic-speech-recognition" as const;
  readonly model: string;
  private readonly dtype?: DataType;
  private readonly cacheDir?: string;
  private readonly allowDownload?: boolean;

  constructor(options: OnnxAutomaticSpeechRecognitionOptions) {
    this.model = options.model;
    // Default to the dtype recorded when the model was pulled, so inference
    // matches what's cached instead of re-downloading another variant.
    this.dtype = options.dtype ?? find(options.model)?.dtype;
    this.cacheDir = options.cacheDir;
    this.allowDownload = options.allowDownload;
  }

  /**
   * Transcribe mono audio at the model's expected rate (16 kHz for Whisper).
   * Language is auto-detected unless `options.language` is set.
   */
  async transcribe(samples: Float32Array, options: AutomaticSpeechRecognitionOptions = {}): Promise<string> {
    const pipe = await this.load();
    const output = await pipe(samples, {
      ...(options.language !== undefined ? { language: options.language } : {}),
      ...(options.task !== undefined ? { task: options.task } : {}),
    });
    const result = Array.isArray(output) ? output[0] : output;
    return result?.text?.trim() ?? "";
  }

  private async load(): Promise<AutomaticSpeechRecognitionPipeline> {
    return loadPipeline<AutomaticSpeechRecognitionPipeline>("automatic-speech-recognition", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: this.dtype,
    });
  }
}
