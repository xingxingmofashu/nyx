import { encodeWavPcm16, OnnxTextToSpeechProvider } from "@nyx/llm"
import type { TextToSpeechOptions } from "@nyx/llm"
import { ProviderCache } from "../../lib/provider-cache"

/** One synthesized clip: WAV bytes plus the waveform's sample rate. */
export interface GeneratedAudio {
  data: Buffer
  mimeType: string
  samplingRate: number
}

/** Runs text-to-speech synthesis against cached model providers. */
export class TextToSpeechService {
  constructor(private readonly cache: ProviderCache = new ProviderCache()) {}

  /** Synthesize speech from `text` with a text-to-speech model. */
  async generate(modelId: string, text: string, options: TextToSpeechOptions = {}): Promise<GeneratedAudio> {
    const provider = this.cache.get(modelId, () => new OnnxTextToSpeechProvider({ model: modelId }))
    const audio = await provider.generate(text, options)

    return {
      data: Buffer.from(encodeWavPcm16(audio.audio, audio.sampling_rate)),
      mimeType: "audio/wav",
      samplingRate: audio.sampling_rate,
    }
  }
}
