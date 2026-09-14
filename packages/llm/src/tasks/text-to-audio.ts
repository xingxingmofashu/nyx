import { RawAudio, type DataType, type TextToAudioPipeline } from "@huggingface/transformers";
import { loadPipeline } from "../runtime.ts";
import { find } from "../models.ts";
import type { AudioProvider, TextToAudioOptions } from "../types.ts";

/** Default generation length for MusicGen, in audio tokens (~10s at 50 tokens/s). */
const MUSICGEN_MAX_NEW_TOKENS = 512;

/**
 * The MusicGen methods we drive directly. The `text-to-audio` pipeline can't
 * run MusicGen (it routes any model that ships a processor into its SpeechT5
 * spectrogram path), so music models are generated through the raw model.
 */
interface MusicgenModel {
  config: {
    model_type?: string;
    sampling_rate?: number;
    audio_encoder?: { sampling_rate?: number };
  };
  generate(inputs: Record<string, unknown>): Promise<{ data: Float32Array }>;
}

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
    const model = pipe.model as unknown as MusicgenModel;
    if (model.config.model_type === "musicgen") {
      return this.generateMusic(model, pipe, text, options);
    }

    const output = await pipe(text, {
      ...(options.speaker !== undefined ? { speaker_embeddings: options.speaker } : {}),
      ...(options.speed !== undefined ? { speed: options.speed } : {}),
      ...(options.numInferenceSteps !== undefined ? { num_inference_steps: options.numInferenceSteps } : {}),
    });
    // The pipeline is typed as `{ audio, sampling_rate }` but returns a `RawAudio`
    // instance at runtime (with `toWav`/`toBlob`/`save`); normalize either shape.
    return output instanceof RawAudio ? output : new RawAudio(output.audio, output.sampling_rate);
  }

  /** Generate music tokens with MusicGen, then decode them to a waveform. */
  private async generateMusic(
    model: MusicgenModel,
    pipe: TextToAudioPipeline,
    text: string,
    options: TextToAudioOptions,
  ): Promise<RawAudio> {
    const tokenizer = pipe.tokenizer as unknown as (input: string) => Record<string, unknown>;
    const inputs = tokenizer(text);
    const maxNewTokens = options.maxNewTokens ?? MUSICGEN_MAX_NEW_TOKENS;
    const { data } = await model.generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      do_sample: true,
      guidance_scale: 3,
    });
    const samplingRate = model.config.audio_encoder?.sampling_rate ?? model.config.sampling_rate ?? 32_000;
    return new RawAudio(data, samplingRate);
  }

  private async load(): Promise<TextToAudioPipeline> {
    return loadPipeline<TextToAudioPipeline>("text-to-audio", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: this.dtype,
    });
  }
}

