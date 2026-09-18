import { ipcMain } from "electron"
import { IPC } from "../../preload/ipc.ts"
import type { LLMTask } from "../../renderer/src/types.ts"
import type { Models as ModelsService } from "../services/models.ts"

export class Models {
  static register(service: ModelsService): void {
    ipcMain.handle(IPC.models.list, () => service.list())
    ipcMain.handle(IPC.models.pull, (_e, modelId: string, task: LLMTask) => service.pull(modelId, task))
    ipcMain.handle(IPC.models.cancelPull, (_e, modelId: string) => service.cancelPull(modelId))
    ipcMain.handle(IPC.models.remove, (_e, modelId: string) => service.remove(modelId))
  }
}
