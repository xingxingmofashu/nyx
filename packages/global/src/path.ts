import { homedir } from "node:os"
import { join } from "node:path"

export class Path {
  private static readonly CONFIG_DIR = ".nyx"

  static get root(): string {
    return join(homedir(), Path.CONFIG_DIR)
  }

  static get models(): string {
    return join(Path.root, "models")
  }

  static get knowledge(): string {
    return join(Path.root, "knowledge")
  }

  static get sessions(): string {
    return join(Path.root, "sessions")
  }
}
