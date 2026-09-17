import type { Dirent } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import fs from "fs-extra"
import { z } from "zod/v4"
import { Global } from "@nyx/global"
import { LLM } from "@nyx/llm"
import { Chunker } from "./chunker.ts"
import { Store, type SearchHit } from "./store.ts"

export const ConfigSchema = z.object({
  dim: z.number().int().positive().optional(),
  indexedModel: z.string().optional(),
  updatedAt: z.string().optional(),
})

const ManifestSchema = z.record(z.string(), z.string())

export type ConfigSchemaType = z.infer<typeof ConfigSchema>

export type DocumentStatus = "indexed" | "stale" | "new"

export interface Document {
  file: string
  size: number
  modifiedAt: string
  status: DocumentStatus
}

export interface DocumentImport {
  path: string
  content: string
}

export interface ImportResult {
  written: string[]
  overwritten: string[]
  skipped: string[]
}

export interface IndexProgress {
  phase: "embed" | "done"
  file?: string
  filesDone: number
  filesTotal: number
  chunks: number
}

export interface IndexStats {
  files: number
  chunks: number
  skipped: number
}

type ManifestSchemaType = z.infer<typeof ManifestSchema>

export class Base {
  private static readonly INDEX_DIR = ".index"
  private static readonly DOCUMENT_EXTENSIONS = [".md", ".markdown"]
  private static readonly IGNORED_DIRS = new Set(["node_modules", ".git"])

  private constructor(
    private readonly dir: string,
    public config: ConfigSchemaType,
    private manifest: ManifestSchemaType,
  ) {}

  static async open(dir: string): Promise<Base> {
    const [config, manifest] = await Promise.all([Base.readConfig(dir), Base.readManifest(dir)])
    return new Base(dir, config, manifest)
  }

  static async embeddingModel(): Promise<string | undefined> {
    return (await Global.Settings.read()).knowledge?.embeddingModel
  }

  async hasDocuments(): Promise<boolean> {
    return (await Base.walk(this.dir)).length > 0
  }

  fileCount(): number {
    return Object.keys(this.manifest).length
  }

  async countChunks(): Promise<number> {
    const store = await Store.open(Base.lanceDir(this.dir))
    try {
      return await store.countChunks()
    } finally {
      await store.close()
    }
  }

  async index(
    options: { onProgress?: (progress: IndexProgress) => void; signal?: AbortSignal } = {},
  ): Promise<IndexStats> {
    const model = await this.requireModel()
    const provider = new LLM.OnnxFeatureExtractionProvider({ model })
    const store = await Store.open(Base.lanceDir(this.dir))
    try {
      const files = await Base.walk(this.dir)
      if (this.config.indexedModel !== model) {
        for (const file of Object.keys(this.manifest)) await store.deleteFile(file)
        this.manifest = {}
        this.config.dim = undefined
      }
      const report = (progress: IndexProgress) => options.onProgress?.(progress)
      const seen = new Set<string>()
      let filesDone = 0
      let skipped = 0
      let dim: number | undefined

      for (const absolute of files) {
        options.signal?.throwIfAborted()
        const file = Base.toPosix(relative(this.dir, absolute))
        seen.add(file)
        const content = await Bun.file(absolute).text()
        const hash = Base.hash(content)
        report({ phase: "embed", file, filesDone, filesTotal: files.length, chunks: 0 })

        if (this.manifest[file] === hash) {
          skipped++
          filesDone++
          continue
        }

        const parts = Chunker.split(content)
        if (parts.length === 0) {
          await store.deleteFile(file)
          delete this.manifest[file]
          filesDone++
          continue
        }

        const embeddings = await provider.embed(
          parts.map((part) => part.text),
          { type: "passage", ...(options.signal ? { signal: options.signal } : {}) },
        )
        if (embeddings.length !== parts.length) throw new Error(`Embedding count mismatch for ${file}`)
        const fileDim = embeddings[0]!.length
        if (this.config.dim !== undefined && this.config.dim !== fileDim) {
          throw new Error(
            `Embedding dimension changed (${this.config.dim} → ${fileDim}); rebuild the index to embed every document again.`,
          )
        }
        dim = fileDim

        await store.replaceFile(
          file,
          parts.map((part, index) => ({
            id: `${file}#${part.ordinal}`,
            file,
            heading: part.heading,
            ordinal: part.ordinal,
            text: part.text,
            vector: embeddings[index]!,
          })),
        )
        this.manifest[file] = hash
        filesDone++
      }

      const stale = new Set([...Object.keys(this.manifest), ...(await store.listFiles())])
      for (const file of stale) {
        if (seen.has(file)) continue
        await store.deleteFile(file)
        delete this.manifest[file]
      }

      const chunks = await store.countChunks()
      if (dim !== undefined) this.config.dim = dim
      this.config.indexedModel = model
      await this.saveManifest()
      await this.saveConfig()
      report({ phase: "done", filesDone, filesTotal: files.length, chunks })
      return { files: files.length, chunks, skipped }
    } finally {
      await store.close()
    }
  }

  async rebuild(
    options: { onProgress?: (progress: IndexProgress) => void; signal?: AbortSignal } = {},
  ): Promise<IndexStats> {
    await fs.remove(Base.indexDir(this.dir))
    this.config = {}
    this.manifest = {}
    return await this.index(options)
  }

  async search(query: string, options: { topK?: number } = {}): Promise<SearchHit[]> {
    const model = await this.requireModel()
    const indexed = this.config.indexedModel
    if (indexed !== undefined && indexed !== model) {
      throw new Error(`The index was built with "${indexed}", but "${model}" is selected; rebuild the index first.`)
    }
    const provider = new LLM.OnnxFeatureExtractionProvider({ model })
    const store = await Store.open(Base.lanceDir(this.dir))
    try {
      const [embedding] = await provider.embed([query], { type: "query" })
      return await store.search(embedding!, query, options.topK ?? 6)
    } finally {
      await store.close()
    }
  }

  async listDocuments(): Promise<Document[]> {
    const files = await Base.walk(this.dir)
    const documents = await Promise.all(
      files.map(async (absolute) => {
        const file = Base.toPosix(relative(this.dir, absolute))
        const [content, stat] = await Promise.all([Bun.file(absolute).text(), fs.stat(absolute)])
        const hash = this.manifest[file]
        return {
          file,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          status: hash === undefined ? "new" : hash === Base.hash(content) ? "indexed" : "stale",
        } satisfies Document
      }),
    )
    return documents.sort((a, b) => a.file.localeCompare(b.file))
  }

  async readDocument(file: string): Promise<string> {
    return await Bun.file(Base.documentPath(this.dir, file)).text()
  }

  async writeDocuments(entries: DocumentImport[], options: { overwrite?: boolean } = {}): Promise<ImportResult> {
    const result: ImportResult = { written: [], overwritten: [], skipped: [] }
    for (const entry of entries) {
      const file = Base.toPosix(entry.path)
      const absolute = Base.documentPath(this.dir, file)
      const exists = await Bun.file(absolute).exists()
      if (exists && options.overwrite !== true) {
        result.skipped.push(file)
        continue
      }
      await fs.ensureDir(dirname(absolute))
      await Bun.write(absolute, entry.content)
      const target = exists ? result.overwritten : result.written
      target.push(file)
    }
    return result
  }

  async deleteDocument(file: string): Promise<void> {
    const path = Base.toPosix(file)
    await fs.remove(Base.documentPath(this.dir, path))
    const store = await Store.open(Base.lanceDir(this.dir))
    try {
      await store.deleteFile(path)
    } finally {
      await store.close()
    }
    delete this.manifest[path]
    await this.saveManifest()
  }

  private async requireModel(): Promise<string> {
    const model = await Base.embeddingModel()
    if (!model) throw new Error("No embedding model is selected.")
    return model
  }

  private async saveConfig(): Promise<void> {
    this.config.updatedAt = new Date().toISOString()
    await fs.outputJson(Base.configPath(this.dir), this.config, { spaces: 2 })
  }

  private async saveManifest(): Promise<void> {
    await fs.outputJson(Base.manifestPath(this.dir), this.manifest, { spaces: 2 })
  }

  private static indexDir(dir: string): string {
    return join(dir, Base.INDEX_DIR)
  }

  private static configPath(dir: string): string {
    return join(Base.indexDir(dir), "config.json")
  }

  private static manifestPath(dir: string): string {
    return join(Base.indexDir(dir), "manifest.json")
  }

  private static lanceDir(dir: string): string {
    return join(Base.indexDir(dir), "lancedb")
  }

  private static async readConfig(dir: string): Promise<ConfigSchemaType> {
    const raw = await Bun.file(Base.configPath(dir)).json().catch(() => undefined)
    const parsed = ConfigSchema.safeParse(raw)
    return parsed.success ? parsed.data : {}
  }

  private static async readManifest(dir: string): Promise<ManifestSchemaType> {
    const raw = await Bun.file(Base.manifestPath(dir)).json().catch(() => undefined)
    const parsed = ManifestSchema.safeParse(raw)
    return parsed.success ? parsed.data : {}
  }

  private static documentPath(dir: string, file: string): string {
    const normalized = Base.toPosix(file).replace(/^\/+/, "")
    const segments = normalized.split("/")
    const valid =
      Base.isDocument(normalized) &&
      segments.every((segment) => segment !== "" && segment !== ".." && !segment.startsWith("."))
    if (!valid) throw new Error(`Invalid document path: ${file}`)
    const root = resolve(dir)
    const absolute = resolve(dir, normalized)
    if (absolute !== join(root, ...segments)) throw new Error(`Invalid document path: ${file}`)
    return absolute
  }

  private static isDocument(path: string): boolean {
    const lower = path.toLowerCase()
    return Base.DOCUMENT_EXTENSIONS.some((extension) => lower.endsWith(extension))
  }

  private static async walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[])
    const files: string[] = []
    for (const entry of entries) {
      if (entry.name.startsWith(".") || Base.IGNORED_DIRS.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) files.push(...(await Base.walk(full)))
      else if (entry.isFile() && Base.isDocument(entry.name)) files.push(full)
    }
    return files
  }

  private static hash(content: string): string {
    return new Bun.CryptoHasher("sha256").update(content).digest("hex")
  }

  private static toPosix(path: string): string {
    return path.split(/[\\/]/).join("/")
  }
}
