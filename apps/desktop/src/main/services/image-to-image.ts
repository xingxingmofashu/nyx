import type { NyxServerProcess } from "../server"
import type { ImageBytes, ImageResult } from "../../shared/types"

/**
 * Bridges the image-to-image tool to the inference server. Stateless proxy:
 * the caller passes the model id with each request.
 */
export class ImageToImageService {
  private readonly manager: NyxServerProcess

  constructor(manager: NyxServerProcess) {
    this.manager = manager
  }

  run(modelId: string, input: ImageBytes): Promise<ImageResult> {
    return this.manager.client.imageToImage(modelId, input)
  }
}
