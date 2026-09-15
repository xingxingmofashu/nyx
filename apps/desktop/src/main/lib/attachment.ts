import { mkdir, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { newId } from "@nyx/shared"
import { workspaceAttachmentsDir } from "@nyx/config"
import type { AttachmentInput, SavedAttachment } from "../../shared/types"

/**
 * User attachments are copied into the workspace's session folder (not kept as
 * data URLs) so the transcript stays small and the agent's tools can read them
 * by the absolute path the model is told about. Deleting the session deletes
 * them with it, and the workspace itself is never touched.
 */

/** Largest attachment copied into the session folder. */
const MAX_BYTES = 20 * 1024 * 1024
/** Extension per accepted image MIME, used when the file name has none. */
const IMAGE_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/avif": ".avif",
}
/** Session ids are client-generated; keep them filesystem-safe (no path escapes). */
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/

/** Reduce a client-supplied name to one short, safe path segment. */
function safeName(name: string): string {
  const cleaned = name
    .replace(/[\\/]+/g, "-")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 64)
  return cleaned || "attachment"
}

/** Copy an attachment into the session folder, returning its absolute path. */
export async function saveAttachment(
  input: AttachmentInput & { workspaceDir: string; sessionId: string },
): Promise<SavedAttachment> {
  if (!input.workspaceDir) throw new Error("Choose a workspace before attaching files")
  if (!SESSION_ID_RE.test(input.sessionId)) throw new Error("Invalid session id")
  if (!input.mimeType.startsWith("image/")) {
    throw new Error(`Unsupported attachment type: ${input.mimeType || "unknown"}`)
  }
  if (input.data.byteLength === 0) throw new Error("Empty attachment")
  if (input.data.byteLength > MAX_BYTES) {
    throw new Error(`Attachment too large (max ${MAX_BYTES / 1024 / 1024} MB)`)
  }

  const dir = workspaceAttachmentsDir(input.workspaceDir)
  await mkdir(dir, { recursive: true })

  const name = safeName(input.name)
  const ext = extname(name) || IMAGE_EXT[input.mimeType] || ".png"
  const stem = name.slice(0, name.length - extname(name).length).slice(0, 60) || "image"
  const target = join(dir, `${input.sessionId}-${stem}-${newId()}${ext}`)
  await writeFile(target, input.data)

  return {
    path: target,
    name,
    mimeType: input.mimeType,
    size: input.data.byteLength,
  }
}
