import type { NyxServerProcess } from "../server"
import type { AudioSamples, TranscriptResult } from "../../shared/types"

/**
 * Bridges the automatic-speech-recognition tool to the inference server.
 * Stateless proxy: the caller passes the model id with each request.
 */
export class AutomaticSpeechRecognitionService {
  private readonly manager: NyxServerProcess

  constructor(manager: NyxServerProcess) {
    this.manager = manager
  }

  run(modelId: string, input: AudioSamples): Promise<TranscriptResult> {
    return this.manager.client.automaticSpeechRecognition(modelId, input)
  }
}
