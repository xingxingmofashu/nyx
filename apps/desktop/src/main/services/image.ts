import type { ServerManager } from "../server/manager"
import type { ImagePayload, ImageResult } from "../../shared/types"

/**
 * Bridges the image-to-image tool to the inference server. Stateless proxy:
 * the caller passes the model id with each request.
 */
export class ImageService {
  private readonly manager: ServerManager

  constructor(manager: ServerManager) {
    this.manager = manager
  }

  run(modelId: string, input: ImagePayload): Promise<ImageResult> {
    return this.manager.client.imageToImage(modelId, input)
  }
}
