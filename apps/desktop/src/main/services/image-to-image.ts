import type { NyxServer } from "../server"
import type { ImagePayload, ImageResult } from "../../shared/types"

/**
 * Bridges the image-to-image tool to the inference server. Stateless proxy:
 * the caller passes the model id with each request.
 */
export class ImageToImageService {
  private readonly manager: NyxServer

  constructor(manager: NyxServer) {
    this.manager = manager
  }

  run(modelId: string, input: ImagePayload): Promise<ImageResult> {
    return this.manager.client.imageToImage(modelId, input)
  }
}
