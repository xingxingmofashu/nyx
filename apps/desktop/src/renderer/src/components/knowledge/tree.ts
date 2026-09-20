import type { KnowledgeDocument } from "../../types"

export interface TreeFolder {
  
  name: string
  
  path: string
  folders: TreeFolder[]
  files: KnowledgeDocument[]
}

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

export function countDocuments(folder: TreeFolder): number {
  return folder.files.length + folder.folders.reduce((total, child) => total + countDocuments(child), 0)
}
