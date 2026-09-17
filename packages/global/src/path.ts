import { homedir } from "node:os"
import { join } from "node:path"

const CONFIG_DIR = ".nyx"

export class Path {
  static get root(): string {
    return join(homedir(), CONFIG_DIR)
  }

  static get models(): string {
    return Bun.env.NYX_MODELS_DIR ?? join(Path.root, "models")
  }

  static get knowledge(): string {
    return Bun.env.NYX_KNOWLEDGE_DIR ?? join(Path.root, "knowledge")
  }

  static get sessions(): string {
    return join(Path.root, "sessions")
  }

  static get modelsCatalog(): string {
    return join(Path.root, "cache", "models.json")
  }
}
