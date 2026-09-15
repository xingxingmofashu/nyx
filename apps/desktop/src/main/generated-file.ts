import { readFile, realpath } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import { getAgentSettings, getSessionsDir } from "@nyx/config"
import { mimeFor } from "@nyx/shared"
import { isWithinPath } from "@nyx/shared/node"

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
      if (!isWithinPath(root, target)) continue
      const realRoot = await realpath(root).catch(() => root)
      const realTarget = await realpath(target)
      if (!isWithinPath(realRoot, realTarget)) continue
      const bytes = await readFile(realTarget)
      return `data:${mimeFor(path)};base64,${bytes.toString("base64")}`
    }
    return null
  } catch {
    return null
  }
}
