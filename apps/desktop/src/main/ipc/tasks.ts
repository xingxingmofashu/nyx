import { ipcMain } from "electron"
import { IPC } from "../../preload/ipc.ts"
import type { AudioSamples, ImageBytes, TextToSpeechInput } from "../../renderer/src/types.ts"
import type { NyxServer } from "../server.ts"

export class Tasks {
  static register(server: NyxServer): void {
    ipcMain.handle(IPC.tasks.imageToImage.run, (_e, modelId: string, input: ImageBytes) =>
      server.imageToImage(modelId, input),
    )
    ipcMain.handle(IPC.tasks.textToSpeech.run, (_e, modelId: string, input: TextToSpeechInput) =>
      server.textToSpeech(modelId, input),
    )
    ipcMain.handle(IPC.tasks.automaticSpeechRecognition.run, (_e, modelId: string, input: AudioSamples) =>
      server.automaticSpeechRecognition(modelId, input),
    )
  }
}
