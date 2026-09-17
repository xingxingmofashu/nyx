import { join, resolve } from "node:path"
import { Path } from "./path.ts"

export class Workspace {
  constructor(readonly dir: string) {}

  get canonical(): string {
    return this.dir ? resolve(this.dir) : this.dir
  }

  get key(): string {
    const key = this.canonical
      .replace(/_/g, "__")
      .replace(/-/g, "_-")
      .replace(/[\\/]/g, "-")
    if (!key) return "_default"
    if (key.length <= 180) return key
    const hash = new Bun.CryptoHasher("sha1").update(key).digest("hex").slice(0, 8)
    return `${key.slice(0, 160)}-${hash}`
  }

  get sessionsDir(): string {
    return join(Path.sessions, this.key)
  }

  get audioDir(): string {
    return join(this.sessionsDir, "audio")
  }

  get imageDir(): string {
    return join(this.sessionsDir, "images")
  }

  get attachmentsDir(): string {
    return join(this.sessionsDir, "attachments")
  }
}
