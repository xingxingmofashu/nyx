import { RawAudio, env, type DataType, type TextToAudioPipeline } from "@huggingface/transformers";
import { loadPipeline } from "../runtime.ts";
import { findModel } from "../model.ts";
import type { SpeechProvider, TextToSpeechOptions } from "../types.ts";

/**
 * SpeechT5 has no built-in voice: it always needs an x-vector speaker embedding.
 * Default to the one the transformers.js example uses, resolved against the
 * configured hub host (so an `HF_ENDPOINT` mirror works offline of huggingface.co).
 */
const DEFAULT_SPEAKER_PATH = "datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";

export interface OnnxTextToSpeechOptions {
  model: string;
  cacheDir?: string;
  /** Override the dtype recorded at pull time. When omitted, the pulled dtype (or the transformers.js default) is used. */
  dtype?: DataType;
  allowDownload?: boolean;
}

export class OnnxTextToSpeechProvider implements SpeechProvider {
  readonly id = "local-onnx";
  readonly task = "text-to-speech" as const;
  readonly model: string;
  private readonly dtype?: DataType;
  private readonly cacheDir?: string;
  private readonly allowDownload?: boolean;

  constructor(options: OnnxTextToSpeechOptions) {
    this.model = options.model;
    // Default to the dtype recorded when the model was pulled, so inference
    // matches what's cached instead of re-downloading another variant.
    this.dtype = options.dtype ?? findModel(options.model)?.dtype;
    this.cacheDir = options.cacheDir;
    this.allowDownload = options.allowDownload;
  }

  /** Synthesize one waveform from `text`; returns the raw audio (samples + sample rate). */
  async generate(text: string, options: TextToSpeechOptions = {}): Promise<RawAudio> {
    const pipe = await this.load();
    const model = pipe.model as unknown as { config: { model_type?: string } };
    // SpeechT5 requires speaker embeddings; supply the default voice when none is given.
    const speaker = options.speaker ?? (model.config.model_type === "speecht5" ? defaultSpeakerUrl() : undefined);
    const output = await pipe(text, {
      ...(speaker !== undefined ? { speaker_embeddings: speaker } : {}),
      ...(options.speed !== undefined ? { speed: options.speed } : {}),
      ...(options.numInferenceSteps !== undefined ? { num_inference_steps: options.numInferenceSteps } : {}),
    });
    // The pipeline is typed as `{ audio, sampling_rate }` but returns a `RawAudio`
    // instance at runtime (with `toWav`/`toBlob`/`save`); normalize either shape.
    return output instanceof RawAudio ? output : new RawAudio(output.audio, output.sampling_rate);
  }

  private async load(): Promise<TextToAudioPipeline> {
    return loadPipeline<TextToAudioPipeline>("text-to-speech", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: this.dtype,
    });
  }
}

/** Default x-vector URL on the active hub host (set by `configureEnv` from settings/HF_ENDPOINT). */
function defaultSpeakerUrl(): string {
  const host = env.remoteHost.endsWith("/") ? env.remoteHost : `${env.remoteHost}/`;
  return `${host}${DEFAULT_SPEAKER_PATH}`;
}

