import { Global } from "@nyx/global"
import { Knowledge } from "@nyx/knowledge"
import { LLM } from "@nyx/llm"
import type { KnowledgeSearchHit, KnowledgeStatus } from "../schema"

export class KnowledgeService {
  private controller?: AbortController

  constructor(private readonly log: (message: string) => void) {}

  private open(): Promise<Knowledge.Base> {
    return Knowledge.Base.open(Global.Path.knowledge)
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
    const embeddingModel = await Knowledge.Base.embeddingModel()
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

  async list(): Promise<Knowledge.Document[]> {
    return await (await this.open()).listDocuments()
  }

  async read(path: string): Promise<string> {
    return await (await this.open()).readDocument(path)
  }

  async importDocuments(documents: Knowledge.DocumentImport[], overwrite = false): Promise<Knowledge.ImportResult> {
    return await (await this.open()).writeDocuments(documents, { overwrite })
  }

  async removeDocument(path: string): Promise<void> {
    await (await this.open()).deleteDocument(path)
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
    options: { rebuild?: boolean; onProgress?: (progress: Knowledge.IndexProgress) => void; signal?: AbortSignal } = {},
  ): Promise<Knowledge.IndexStats> {
    await this.requireModel()
    const kb = await this.open()
    const stats = options.rebuild === true ? await kb.rebuild(options) : await kb.index(options)
    this.log(
      `${options.rebuild === true ? "rebuilt" : "indexed"} ${stats.chunks} chunks from ${stats.files} files (${stats.skipped} unchanged)`,
    )
    return stats
  }

  private async requireModel(): Promise<string> {
    const model = await Knowledge.Base.embeddingModel()
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
