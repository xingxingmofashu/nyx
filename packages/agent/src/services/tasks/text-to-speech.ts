import { LLM } from "@nyx/llm"
import { Provider } from "../../provider.ts"

/** One synthesized clip: WAV bytes plus the waveform's sample rate. */
export interface GeneratedAudio {
  data: Buffer
  mimeType: string
  samplingRate: number
}

/** Runs text-to-speech synthesis against cached model providers. */
export class TextToSpeechService {
  constructor(private readonly cache: Provider = new Provider()) {}

  /** Synthesize speech from `text` with a text-to-speech model. */
  async generate(modelId: string, text: string, options: LLM.TextToSpeechOptions = {}): Promise<GeneratedAudio> {
    const provider = this.cache.get(modelId, () => new LLM.OnnxTextToSpeechProvider({ model: modelId }))
    const audio = await provider.generate(text, options)

    return {
      data: Buffer.from(LLM.Wav.encodePcm16(audio.audio, audio.sampling_rate)),
      mimeType: "audio/wav",
      samplingRate: audio.sampling_rate,
    }
  }
}
