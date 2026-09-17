import type { KnowledgeDocument } from "../../../../shared/types"

/** A folder of the knowledge tree; `""` is the invisible root. */
export interface TreeFolder {
  /** Folder name as shown; "" for the invisible root. */
  name: string
  /** Folder path relative to the knowledge root; "" for the root. */
  path: string
  folders: TreeFolder[]
  files: KnowledgeDocument[]
}

/** Nest flat document paths into folders, sorted folders-first. */
export function buildTree(documents: KnowledgeDocument[]): TreeFolder {
  const root: TreeFolder = { name: "", path: "", folders: [], files: [] }
  for (const doc of documents) {
    const segments = doc.file.split("/")
    const name = segments.pop()
    if (name === undefined) continue
    let folder = root
    for (const segment of segments) {
      const path = folder.path === "" ? segment : `${folder.path}/${segment}`
      let child = folder.folders.find((candidate) => candidate.name === segment)
      if (child === undefined) {
        child = { name: segment, path, folders: [], files: [] }
        folder.folders.push(child)
      }
      folder = child
    }
    folder.files.push(doc)
  }
  const sort = (folder: TreeFolder) => {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name))
    folder.files.sort((a, b) => a.file.localeCompare(b.file))
    folder.folders.forEach(sort)
  }
  sort(root)
  return root
}

/** Documents under a folder, including its subfolders. */
export function countDocuments(folder: TreeFolder): number {
  return folder.files.length + folder.folders.reduce((total, child) => total + countDocuments(child), 0)
}
