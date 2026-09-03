import type { ServerManager } from "../server/manager"
import type { ImagePayload, ImageResult } from "../../shared/types"

/**
 * Bridges the image-to-image tool to the inference server.
 */
export class ImageService {
  private readonly manager: ServerManager
  private modelId = ""

  constructor(manager: ServerManager) {
    this.manager = manager
  }

  get currentModel(): string {
    return this.modelId
  }

  setModel(modelId: string): void {
    this.modelId = modelId
  }

  async run(input: ImagePayload): Promise<ImageResult> {
    if (!this.modelId) throw new Error("No image-to-image model selected. Pick a model first.")
    return this.manager.client.imageToImage(this.modelId, input)
  }
}
