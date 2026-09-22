import { LLM } from "@nyx/llm"
import { z } from "zod/v4"
import { Provider } from "../../provider.ts"

export interface AudioSamples {
  samples: Float32Array
  samplingRate: number
}

export const AutomaticSpeechRecognitionInputSchema = z.object({
  audio: z.object({ data: z.string().min(1), samplingRate: z.number().positive() }),
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
    signal?: AbortSignal,
  ): Promise<string> {
    if (samplingRate !== 16000) {
      throw new Error(`automatic-speech-recognition expects 16 kHz audio, got ${samplingRate} Hz`)
    }
    if (samples.length === 0) throw new Error("automatic-speech-recognition received no audio samples")
    signal?.throwIfAborted()
    const provider = this.cache.get(() => new LLM.OnnxAutomaticSpeechRecognitionProvider({ model: modelId }))
    return await AutomaticSpeechRecognition.race(provider.transcribe(samples, options), signal)
  }

  private static async race<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise
    if (signal.aborted) throw signal.reason
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason)
      signal.addEventListener("abort", onAbort, { once: true })
    })
    try {
      return await Promise.race([promise, aborted])
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort)
    }
  }
}
