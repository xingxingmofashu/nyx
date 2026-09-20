import { IPC } from "../../preload/ipc.ts"
import type { LLMTask } from "../../renderer/src/types.ts"
import type { Models as ModelsService } from "../services/models.ts"
import { Guard } from "./guard.ts"

export class Models {
  static register(service: ModelsService): void {
    Guard.handle(IPC.models.list, () => service.list())
    Guard.handle(IPC.models.pull, (_e, modelId: string, task: LLMTask) => service.pull(modelId, task))
    Guard.handle(IPC.models.cancelPull, (_e, modelId: string) => service.cancelPull(modelId))
    Guard.handle(IPC.models.remove, (_e, modelId: string) => service.remove(modelId))
  }
}
