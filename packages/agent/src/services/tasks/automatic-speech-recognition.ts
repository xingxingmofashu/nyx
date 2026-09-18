import { LLM } from "@nyx/llm"
import { z } from "zod/v4"
import { Provider } from "../../provider.ts"

export interface AudioSamples {
  samples: Float32Array
  samplingRate: number
}

export const AutomaticSpeechRecognitionInputSchema = z.object({
  audio: z.object({ data: z.string(), samplingRate: z.number() }),
  language: z.string().optional(),
  task: z.enum(["transcribe", "translate"]).optional(),
})
export type AutomaticSpeechRecognitionInput = z.infer<typeof AutomaticSpeechRecognitionInputSchema>

export const AutomaticSpeechRecognitionRequestSchema = AutomaticSpeechRecognitionInputSchema.extend({
  model: z.string().min(1),
})
export type AutomaticSpeechRecognitionRequest = z.infer<typeof AutomaticSpeechRecognitionRequestSchema>

export const TranscriptResultSchema = z.object({ text: z.string() })
export type TranscriptResult = z.infer<typeof TranscriptResultSchema>

export class AutomaticSpeechRecognition {
  constructor(private readonly cache: Provider = new Provider()) {}

  async transcribe(
    modelId: string,
    samples: Float32Array,
    samplingRate: number,
    options: LLM.AutomaticSpeechRecognitionOptions = {},
  ): Promise<string> {
    if (samplingRate !== 16000) {
      throw new Error(`automatic-speech-recognition expects 16 kHz audio, got ${samplingRate} Hz`)
    }
    const provider = this.cache.get(
      modelId,
      () => new LLM.OnnxAutomaticSpeechRecognitionProvider({ model: modelId }),
    )
    return provider.transcribe(samples, options)
  }
}
