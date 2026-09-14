import type { NyxServerProcess } from "../server"
import type { AudioResult, TextToSpeechInput } from "../../shared/types"

/**
 * Bridges the text-to-speech tool to the inference server. Stateless proxy:
 * the caller passes the model id with each request.
 */
export class TextToSpeechService {
  private readonly manager: NyxServerProcess

  constructor(manager: NyxServerProcess) {
    this.manager = manager
  }

  run(modelId: string, input: TextToSpeechInput): Promise<AudioResult> {
    return this.manager.client.textToSpeech(modelId, input)
  }
}
