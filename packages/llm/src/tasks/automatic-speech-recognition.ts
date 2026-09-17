import type { AutomaticSpeechRecognitionPipeline, DataType } from "@huggingface/transformers"
import { Runtime } from "../runtime.ts"
import { Model, type LLMProvider } from "../model.ts"

export interface AutomaticSpeechRecognitionOptions {
  language?: string
  task?: "transcribe" | "translate"
}

export interface TranscriptionProvider extends LLMProvider {
  readonly task: "automatic-speech-recognition"
  transcribe(samples: Float32Array, options?: AutomaticSpeechRecognitionOptions): Promise<string>
}

export interface OnnxAutomaticSpeechRecognitionOptions {
  model: string
  cacheDir?: string
  dtype?: DataType
  allowDownload?: boolean
}

export class OnnxAutomaticSpeechRecognitionProvider implements TranscriptionProvider {
  private static readonly NON_SPEECH_MARKER =
    /\[\s*(?:blank_audio|inaudible|silence|noise|music|applause|laughter)\s*\]|\(\s*(?:inaudible|silence|noise|music|applause|laughter|笑|笑声|笑聲|鼓掌)\s*\)/giu

  readonly id = "local-onnx"
  readonly task = "automatic-speech-recognition" as const
  readonly model: string
  private dtype?: DataType
  private readonly cacheDir?: string
  private readonly allowDownload?: boolean

  constructor(options: OnnxAutomaticSpeechRecognitionOptions) {
    this.model = options.model
    this.dtype = options.dtype
    this.cacheDir = options.cacheDir
    this.allowDownload = options.allowDownload
  }

  async transcribe(samples: Float32Array, options: AutomaticSpeechRecognitionOptions = {}): Promise<string> {
    const pipe = await this.load()
    const output = await pipe(samples, {
      ...(options.language !== undefined ? { language: options.language } : {}),
      ...(options.task !== undefined ? { task: options.task } : {}),
    })
    const result = Array.isArray(output) ? output[0] : output
    return OnnxAutomaticSpeechRecognitionProvider.clean(result?.text ?? "")
  }

  private async load(): Promise<AutomaticSpeechRecognitionPipeline> {
    if (this.dtype === undefined) this.dtype = (await Model.find(this.model))?.dtype
    return Runtime.pipeline<AutomaticSpeechRecognitionPipeline>("automatic-speech-recognition", this.model, {
      cacheDir: this.cacheDir,
      allowDownload: this.allowDownload,
      dtype: this.dtype,
    })
  }

  private static clean(text: string): string {
    return text.replace(OnnxAutomaticSpeechRecognitionProvider.NON_SPEECH_MARKER, "").replace(/\s+/g, " ").trim()
  }
}
