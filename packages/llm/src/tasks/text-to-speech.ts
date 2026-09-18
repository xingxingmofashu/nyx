import { RawAudio, env, type DataType, type TextToAudioPipeline } from "@huggingface/transformers"
import { Runtime } from "../runtime.ts"
import { Model, type LLMProvider } from "../model.ts"

export interface TextToSpeechOptions {
  speaker?: string | Float32Array
  speed?: number
  numInferenceSteps?: number
}

export interface SpeechProvider extends LLMProvider {
  readonly task: "text-to-speech"
  generate(text: string, options?: TextToSpeechOptions): Promise<RawAudio>
}

export interface OnnxTextToSpeechOptions {
  model: string
  dtype?: DataType
}

export class OnnxTextToSpeechProvider implements SpeechProvider {
  private static readonly DEFAULT_SPEAKER_PATH =
    "datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin"

  readonly id = "local-onnx"
  readonly task = "text-to-speech" as const
  readonly model: string
  private dtype?: DataType

  constructor(options: OnnxTextToSpeechOptions) {
    this.model = options.model
    this.dtype = options.dtype
  }

  async generate(text: string, options: TextToSpeechOptions = {}): Promise<RawAudio> {
    const pipe = await this.load()
    const model = pipe.model as unknown as { config: { model_type?: string } }
    const speaker =
      options.speaker ??
      (model.config.model_type === "speecht5" ? OnnxTextToSpeechProvider.defaultSpeakerUrl() : undefined)
    const output = await pipe(text, {
      ...(speaker !== undefined ? { speaker_embeddings: speaker } : {}),
      ...(options.speed !== undefined ? { speed: options.speed } : {}),
      ...(options.numInferenceSteps !== undefined ? { num_inference_steps: options.numInferenceSteps } : {}),
    })
    return output instanceof RawAudio ? output : new RawAudio(output.audio, output.sampling_rate)
  }

  private async load(): Promise<TextToAudioPipeline> {
    if (this.dtype === undefined) this.dtype = (await Model.find(this.model))?.dtype
    return Runtime.pipeline<TextToAudioPipeline>("text-to-speech", this.model, { dtype: this.dtype })
  }

  private static defaultSpeakerUrl(): string {
    const host = env.remoteHost.endsWith("/") ? env.remoteHost : `${env.remoteHost}/`
    return `${host}${OnnxTextToSpeechProvider.DEFAULT_SPEAKER_PATH}`
  }
}
