import { OnnxAutomaticSpeechRecognitionProvider } from "@nyx/llm"
import type { AutomaticSpeechRecognitionOptions } from "@nyx/llm"
import { ProviderCache } from "../../lib/provider-cache"

/** Runs automatic-speech-recognition inference against cached model providers. */
export class AutomaticSpeechRecognitionService {
  constructor(private readonly cache: ProviderCache = new ProviderCache()) {}

  /**
   * Transcribe mono 16 kHz PCM samples with an automatic-speech-recognition
   * model. Whisper expects 16 kHz input; other rates are rejected rather than
   * silently mistranscribed.
   */
  async transcribe(
    modelId: string,
    samples: Float32Array,
    samplingRate: number,
    options: AutomaticSpeechRecognitionOptions = {},
  ): Promise<string> {
    if (samplingRate !== 16000) {
      throw new Error(`automatic-speech-recognition expects 16 kHz audio, got ${samplingRate} Hz`)
    }
    const provider = this.cache.get(modelId, () => new OnnxAutomaticSpeechRecognitionProvider({ model: modelId }))
    return provider.transcribe(samples, options)
  }
}
