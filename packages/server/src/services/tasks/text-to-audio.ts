import { OnnxTextToAudioProvider } from "@nyx/llm"
import type { TextToAudioOptions } from "@nyx/llm"
import { ProviderCache } from "../../lib/provider-cache"

/** One synthesized clip: WAV bytes plus the waveform's sample rate. */
export interface GeneratedAudio {
  data: Buffer
  mimeType: string
  samplingRate: number
}

/** Runs text-to-audio synthesis against cached model providers. */
export class TextToAudioService {
  constructor(private readonly cache: ProviderCache = new ProviderCache()) {}

  /** Synthesize speech/audio from `text` with a text-to-audio model. */
  async generate(modelId: string, text: string, options: TextToAudioOptions = {}): Promise<GeneratedAudio> {
    const provider = this.cache.get(modelId, () => new OnnxTextToAudioProvider({ model: modelId }))
    const audio = await provider.generate(text, options)

    return {
      data: Buffer.from(audio.toWav()),
      mimeType: "audio/wav",
      samplingRate: audio.sampling_rate,
    }
  }
}
