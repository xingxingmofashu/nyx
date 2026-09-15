import { readFile, realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { getAgentSettings, getSessionsDir } from "@nyx/config"

/** True when `target` is `root` or a descendant of it. */
function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** Best-effort media MIME from a file extension. */
function mimeFor(path: string): string {
  switch (path.split(".").pop()?.toLowerCase()) {
    case "wav":
      return "audio/wav"
    case "mp3":
      return "audio/mpeg"
    case "png":
      return "image/png"
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
 * Read a file the agent generated as a `data:` URL, e.g. an image tool's output
 * (a workspace-relative path) or a spoken reply (an absolute path in the
 * workspace's session audio folder). Paths are confined to the workspace or the
 * `~/.nyx/sessions` tree lexically and through symlinks; resolves null when
 * missing or outside every root — e.g. a restored session whose clip is gone.
 */
export async function readGeneratedFileDataUrl(path: string): Promise<string | null> {
  const workspaceRoot = resolve(getAgentSettings().workspaceDir ?? process.cwd())
  const target = isAbsolute(path) ? resolve(path) : resolve(workspaceRoot, path)
  try {
    for (const root of [workspaceRoot, getSessionsDir()]) {
      if (!isWithin(root, target)) continue
      const realRoot = await realpath(root).catch(() => root)
      const realTarget = await realpath(target)
      if (!isWithin(realRoot, realTarget)) continue
      const bytes = await readFile(realTarget)
      return `data:${mimeFor(path)};base64,${bytes.toString("base64")}`
    }
    return null
  } catch {
    return null
  }
}
