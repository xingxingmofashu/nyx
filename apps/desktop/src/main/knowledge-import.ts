import { readdir, readFile, stat } from "node:fs/promises"
import { basename, join, relative, sep } from "node:path"
import type { Dirent } from "node:fs"

/**
 * Reads documents the user picked (or a whole folder) into import payloads for
 * the knowledge base. Nothing is written here: main only reads the disk, the
 * server owns the knowledge dir.
 */

/** One document to import, with the path it should take in the knowledge dir. */
export interface ImportDocument {
  path: string
  content: string
}

/** Only Markdown is indexed, so only Markdown is imported. */
const DOCUMENT_EXTENSIONS = [".md", ".markdown"]
const IGNORED_DIRS = new Set(["node_modules", ".git"])
/** Per-file cap; a stray huge file should not be shipped over IPC. */
const MAX_BYTES = 5 * 1024 * 1024

/** Read picked Markdown files; each keeps its own file name in the knowledge root. */
export async function readPickedDocuments(paths: string[]): Promise<ImportDocument[]> {
  const documents: ImportDocument[] = []
  for (const path of paths) {
    if (!isMarkdown(path) || !(await isReadableFile(path))) continue
    documents.push({ path: basename(path), content: await readFile(path, "utf8") })
  }
  return documents.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Read a folder's Markdown recursively, nested under a folder named after it
 * (`~/notes/a.md` → `notes/a.md`) so importing two trees cannot collide.
 */
export async function readFolderDocuments(dir: string): Promise<ImportDocument[]> {
  const root = basename(dir)
  const documents: ImportDocument[] = []
  const walk = async (current: string): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && isMarkdown(entry.name) && (await isReadableFile(full))) {
        documents.push({
          path: toPosix(join(root, relative(dir, full))),
          content: await readFile(full, "utf8"),
        })
      }
    }
  }
  await walk(dir)
  return documents.sort((a, b) => a.path.localeCompare(b.path))
}

function isMarkdown(path: string): boolean {
  const lower = path.toLowerCase()
  return DOCUMENT_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/** True for an existing regular file below the size cap. */
async function isReadableFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path)
    return stats.isFile() && stats.size <= MAX_BYTES
  } catch {
    return false
  }
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/")
}
