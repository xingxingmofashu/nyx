import { readFile, realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { getAgentSettings } from "@nyx/config"

/** Throw when `target` is not `root` or a descendant of it. */
function assertWithin(root: string, target: string): void {
  const rel = relative(root, target)
  const inside = rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  if (!inside) throw new Error(`path escapes workspace: ${target}`)
}

/** Best-effort media MIME from a file extension. */
function mimeFor(path: string): string {
  switch (path.split(".").pop()?.toLowerCase()) {
    case "wav":
      return "audio/wav"
    case "mp3":
      return "audio/mpeg"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "webp":
      return "image/webp"
    case "gif":
      return "image/gif"
    default:
      return "application/octet-stream"
  }
}

/**
 * Read a workspace file as a `data:` URL. The path is resolved against the
 * configured agent workspace and confined to it (lexically and through
 * symlinks); resolves null when missing or outside the workspace, e.g. a
 * restored session whose generated clip has since been deleted.
 */
export async function readWorkspaceFileDataUrl(path: string): Promise<string | null> {
  const root = resolve(getAgentSettings().workspaceDir ?? process.cwd())
  const target = resolve(root, path)
  try {
    assertWithin(root, target)
    const realRoot = await realpath(root).catch(() => root)
    const realTarget = await realpath(target)
    assertWithin(realRoot, realTarget)
    const bytes = await readFile(realTarget)
    return `data:${mimeFor(path)};base64,${bytes.toString("base64")}`
  } catch {
    return null
  }
}
