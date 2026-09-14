import type { NyxServerProcess } from "../server"
import type { AudioResult, TextToAudioInput } from "../../shared/types"

/**
 * Bridges the text-to-audio tool to the inference server. Stateless proxy:
 * the caller passes the model id with each request.
 */
export class TextToAudioService {
  private readonly manager: NyxServerProcess

  constructor(manager: NyxServerProcess) {
    this.manager = manager
  }

  run(modelId: string, input: TextToAudioInput): Promise<AudioResult> {
    return this.manager.client.textToAudio(modelId, input)
  }
}
