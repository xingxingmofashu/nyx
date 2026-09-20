import { LLM } from "@nyx/llm"
import { z } from "zod/v4"
import { Provider } from "../../provider.ts"

export const TextToSpeechInputSchema = z.object({
  text: z.string().trim().min(1),
  speaker: z.string().optional(),
  speed: z.number().optional(),
})
export type TextToSpeechInput = z.infer<typeof TextToSpeechInputSchema>

export const TextToSpeechRequestSchema = z.object({
  model: z.string().min(1),
  text: z.string().trim().min(1),
  speaker: z.string().optional(),
  speed: z.number().optional(),
})
export type TextToSpeechRequest = z.infer<typeof TextToSpeechRequestSchema>

export interface AudioResult {
  data: Uint8Array
  mimeType: string
  samplingRate: number
}

export interface GeneratedAudio {
  data: Buffer
  mimeType: string
  samplingRate: number
}

export class TextToSpeech {
  constructor(private readonly cache: Provider = new Provider()) {}

  async generate(
    modelId: string,
    text: string,
    options: LLM.TextToSpeechOptions = {},
  ): Promise<GeneratedAudio> {
    const provider = this.cache.get(() => new LLM.OnnxTextToSpeechProvider({ model: modelId }))
    const audio = await provider.generate(text, options)

    return {
      data: Buffer.from(LLM.Wav.encodePcm16(audio.audio, audio.sampling_rate)),
      mimeType: "audio/wav",
      samplingRate: audio.sampling_rate,
    }
  }
}
