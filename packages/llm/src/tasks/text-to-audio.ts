import { RawAudio, type DataType, type TextToAudioPipeline } from "@huggingface/transformers";
import { loadPipeline } from "../runtime.ts";
import { find } from "../models.ts";
import type { AudioProvider, TextToAudioOptions } from "../types.ts";

export interface OnnxTextToAudioOptions {
  model: string;
  cacheDir?: string;
  /** Override the dtype recorded at pull time. When omitted, the pulled dtype (or the transformers.js default) is used. */
  dtype?: DataType;
  allowDownload?: boolean;
}

export class OnnxTextToAudioProvider implements AudioProvider {
  readonly id = "local-onnx";
  readonly task = "text-to-audio" as const;
  readonly model: string;
  private readonly dtype?: DataType;
  private readonly cacheDir?: string;
  private readonly allowDownload?: boolean;

  constructor(options: OnnxTextToAudioOptions) {
    this.model = options.model;
    // Default to the dtype recorded when the model was pulled, so inference
    // matches what's cached instead of re-downloading another variant.
    this.dtype = options.dtype ?? find(options.model)?.dtype;
    this.cacheDir = options.cacheDir;
    this.allowDownload = options.allowDownload;
  }

  /** Synthesize one waveform from `text`; returns the raw audio (samples + sample rate). */
  async generate(text: string, options: TextToAudioOptions = {}): Promise<RawAudio> {
    const pipe = await this.load();
    const output = await pipe(text, {
      ...(options.speaker !== undefined ? { speaker_embeddings: options.speaker } : {}),
      ...(options.speed !== undefined ? { speed: options.speed } : {}),
      ...(options.numInferenceSteps !== undefined ? { num_inference_steps: options.numInferenceSteps } : {}),
    });
    // The pipeline is typed as `{ audio, sampling_rate }` but returns a `RawAudio`
    // instance at runtime (with `toWav`/`toBlob`/`save`); normalize either shape.
    return output instanceof RawAudio ? output : new RawAudio(output.audio, output.sampling_rate);
  }

  private async load(): Promise<TextToAudioPipeline> {
    return loadPipeline<TextToAudioPipeline>("text-to-audio", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: this.dtype,
    });
  }
}
