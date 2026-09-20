import { Global } from "@nyx/global"
import { Knowledge as KnowledgeBase } from "@nyx/knowledge"
import { LLM } from "@nyx/llm"
import { z } from "zod/v4"

export const KnowledgeSearchHitSchema = z.object({
  file: z.string(),
  text: z.string(),
  score: z.number(),
})
export type KnowledgeSearchHit = z.infer<typeof KnowledgeSearchHitSchema>

export const KnowledgeDocumentStatusSchema = z.enum(["indexed", "stale", "new"])
export type KnowledgeDocumentStatus = z.infer<typeof KnowledgeDocumentStatusSchema>

export const KnowledgeDocumentSchema = z.object({
  file: z.string(),
  size: z.number(),
  modifiedAt: z.string(),
  status: KnowledgeDocumentStatusSchema,
})
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>

export const KnowledgeStatusSchema = z.object({
  dir: z.string(),
  embeddingModel: z.string().optional(),
  indexedModel: z.string().optional(),
  modelDownloaded: z.boolean(),
  availableEmbeddingModels: z.array(z.string()),
  documents: z.number(),
  indexed: z.number(),
  chunks: z.number(),
  updatedAt: z.string().optional(),
  indexing: z.boolean(),
})
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>

export const KnowledgeDocumentInputSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})
export type KnowledgeDocumentInput = z.infer<typeof KnowledgeDocumentInputSchema>

export const KnowledgeImportRequestSchema = z.object({
  documents: z.array(KnowledgeDocumentInputSchema).min(1),
  overwrite: z.boolean().optional(),
})
export type KnowledgeImportRequestInput = z.infer<typeof KnowledgeImportRequestSchema>

export const KnowledgeImportResultSchema = z.object({
  written: z.array(z.string()),
  overwritten: z.array(z.string()),
  skipped: z.array(z.string()),
})
export type KnowledgeImportResult = z.infer<typeof KnowledgeImportResultSchema>

export const KnowledgeDeleteRequestSchema = z.object({
  path: z.string().min(1),
})
export type KnowledgeDeleteRequestInput = z.infer<typeof KnowledgeDeleteRequestSchema>

export const KnowledgeReadQuerySchema = z.object({
  path: z.string().min(1),
})
export type KnowledgeReadQueryInput = z.infer<typeof KnowledgeReadQuerySchema>

export const KnowledgeIndexRequestSchema = z.object({
  rebuild: z.boolean().optional(),
})
export type KnowledgeIndexRequestInput = z.infer<typeof KnowledgeIndexRequestSchema>

export const KnowledgeSearchRequestSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().max(20).optional(),
})
export type KnowledgeSearchRequestInput = z.infer<typeof KnowledgeSearchRequestSchema>

export const KnowledgeIndexProgressSchema = z.object({
  phase: z.enum(["embed", "done"]),
  file: z.string().optional(),
  filesDone: z.number(),
  filesTotal: z.number(),
  chunks: z.number(),
})
export type KnowledgeIndexProgress = z.infer<typeof KnowledgeIndexProgressSchema>

export class Knowledge {
  private controller?: AbortController
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly log: (message: string) => void) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation)
    this.queue = run.catch(() => undefined)
    return run
  }

  private assertIdle(): void {
    if (this.controller) throw new Error("The knowledge index is being built; try again once it finishes.")
  }

  async hasDocuments(): Promise<boolean> {
    return await (await this.open()).hasDocuments()
  }

  async search(query: string, topK = 6): Promise<KnowledgeSearchHit[]> {
    if (this.controller) throw new Error("The knowledge index is being built; search again once it finishes.")
    const kb = await this.open()
    if (kb.fileCount() === 0) {
      throw new Error("The knowledge index is empty. Build it from the Knowledge page (Update index).")
    }
    await this.requireModel()
    return await kb.search(query, { topK })
  }

  async status(): Promise<KnowledgeStatus> {
    const kb = await this.open()
    const embeddingModel = await KnowledgeBase.Base.embeddingModel()
    const { indexedModel, updatedAt } = kb.config
    const chunks = await kb.countChunks().catch(() => 0)
    return {
      dir: Global.Path.knowledge,
      ...(embeddingModel !== undefined ? { embeddingModel } : {}),
      ...(indexedModel !== undefined ? { indexedModel } : {}),
      modelDownloaded: embeddingModel !== undefined && (await LLM.Model.find(embeddingModel)) !== undefined,
      availableEmbeddingModels: (await LLM.Model.list())
        .filter((model) => model.task === "feature-extraction")
        .map((model) => model.id),
      documents: (await kb.listDocuments()).length,
      indexed: kb.fileCount(),
      chunks,
      ...(updatedAt !== undefined ? { updatedAt } : {}),
      indexing: this.controller !== undefined,
    }
  }

  async list(): Promise<KnowledgeBase.Document[]> {
    return await (await this.open()).listDocuments()
  }

  async read(path: string): Promise<string> {
    return await (await this.open()).readDocument(path)
  }

  async importDocuments(
    documents: KnowledgeBase.DocumentImport[],
    overwrite = false,
  ): Promise<KnowledgeBase.ImportResult> {
    this.assertIdle()
    return await this.serialize(async () => {
      this.assertIdle()
      return await (await this.open()).writeDocuments(documents, { overwrite })
    })
  }

  async removeDocument(path: string): Promise<void> {
    this.assertIdle()
    await this.serialize(async () => {
      this.assertIdle()
      await (await this.open()).deleteDocument(path)
    })
  }

  get indexing(): boolean {
    return this.controller !== undefined
  }

  beginIndex(): AbortController {
    if (this.controller) throw new Error("An index run is already in progress.")
    const controller = new AbortController()
    this.controller = controller
    return controller
  }

  endIndex(): void {
    this.controller = undefined
  }

  cancelIndex(): boolean {
    if (!this.controller) return false
    this.controller.abort()
    return true
  }

  async index(
    options: {
      rebuild?: boolean
      onProgress?: (progress: KnowledgeBase.IndexProgress) => void
      signal?: AbortSignal
    } = {},
  ): Promise<KnowledgeBase.IndexStats> {
    await this.requireModel()
    const kb = await this.open()
    const stats = options.rebuild === true ? await kb.rebuild(options) : await kb.index(options)
    this.log(
      `${options.rebuild === true ? "rebuilt" : "indexed"} ${stats.chunks} chunks from ${stats.files} files (${stats.skipped} unchanged)`,
    )
    return stats
  }

  private open(): Promise<KnowledgeBase.Base> {
    return KnowledgeBase.Base.open(Global.Path.knowledge)
  }

  private async requireModel(): Promise<string> {
    const model = await KnowledgeBase.Base.embeddingModel()
    if (!model) {
      throw new Error(
        'No embedding model is selected. Download one from the Local models page (task "feature-extraction") and pick it above.',
      )
    }
    if (!(await LLM.Model.find(model))) {
      throw new Error(
        `Embedding model "${model}" is not downloaded. Download it from the Local models page (task "feature-extraction").`,
      )
    }
    return model
  }
}
