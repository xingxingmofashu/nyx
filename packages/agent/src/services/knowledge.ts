import { getKnowledgeDir } from "@nyx/config"
import {
  KnowledgeBase,
  resolveEmbeddingModel,
  type DocumentImport,
  type ImportResult,
  type IndexProgress,
  type IndexStats,
  type KnowledgeDocument,
} from "@nyx/knowledge"
import { findModel } from "@nyx/llm"
import type { KnowledgeSearchHit, KnowledgeStatus } from "../schema"

/**
 * Owns the single local knowledge base (Markdown files under the nyx knowledge
 * dir, `~/.nyx/knowledge` by default) and is the only writer of its index.
 * Indexing runs the local ONNX embedding model, so it is CPU-bound, and it is
 * never implicit: nothing embeds at server startup or on a query. Only the
 * desktop's Knowledge page starts a run, through `beginIndex()`/`endIndex()` —
 * one run at a time, cancellable between files, with progress streamed to the
 * caller. Importing and deleting documents never index on their own either.
 *
 * Logging is injected and defaults to silent: the CLI runs this server
 * in-process while a TUI owns the terminal, so writing to stdout/stderr there
 * would corrupt the render. The standalone binary passes a stderr logger.
 */
export class KnowledgeService {
  private kb = KnowledgeBase.open()
  private controller?: AbortController

  constructor(private readonly log: (message: string) => void = () => {}) {}

  /** True when the knowledge dir holds at least one `.md` file. */
  hasDocuments(): boolean {
    return this.kb.hasDocuments()
  }

  /**
   * Hybrid search over the index. Never indexes implicitly: it either uses the
   * index that is already there or reports that one has to be built.
   */
  async search(query: string, topK = 6): Promise<KnowledgeSearchHit[]> {
    if (this.controller) throw new Error("The knowledge index is being built; search again once it finishes.")
    if (this.kb.fileCount() === 0) {
      throw new Error("The knowledge index is empty. Build it from the Knowledge page (Update index).")
    }
    this.requireModel()
    return this.kb.search(query, { topK })
  }

  /** Everything the knowledge management page shows at a glance. */
  async status(): Promise<KnowledgeStatus> {
    const embeddingModel = resolveEmbeddingModel()
    const { indexedModel, updatedAt } = this.kb.config
    // A missing or unreadable index is 0 chunks, not an error: the page then
    // offers to build one.
    const chunks = await this.kb.countChunks().catch(() => 0)
    return {
      dir: getKnowledgeDir(),
      embeddingModel,
      ...(indexedModel !== undefined ? { indexedModel } : {}),
      modelDownloaded: findModel(embeddingModel) !== undefined,
      documents: this.kb.listDocuments().length,
      indexed: this.kb.fileCount(),
      chunks,
      ...(updatedAt !== undefined ? { updatedAt } : {}),
      indexing: this.controller !== undefined,
    }
  }

  /** Documents on disk with their index status. */
  list(): KnowledgeDocument[] {
    return this.kb.listDocuments()
  }

  /** One document's Markdown source. */
  read(path: string): string {
    return this.kb.readDocument(path)
  }

  /** Write imported documents; existing paths are replaced only when asked. */
  async importDocuments(documents: DocumentImport[], overwrite = false): Promise<ImportResult> {
    return await this.kb.writeDocuments(documents, { overwrite })
  }

  /** Delete one document (file, chunks and manifest entry). */
  async removeDocument(path: string): Promise<void> {
    await this.kb.deleteDocument(path)
  }

  /** True while a manual index run is in flight. */
  get indexing(): boolean {
    return this.controller !== undefined
  }

  /**
   * Claim the single index slot. Throws when a run is already in flight so the
   * route can answer 409 instead of stacking two CPU-bound runs.
   */
  beginIndex(): AbortController {
    if (this.controller) throw new Error("An index run is already in progress.")
    const controller = new AbortController()
    this.controller = controller
    return controller
  }

  /** Release the index slot (always, even when the run threw). */
  endIndex(): void {
    this.controller = undefined
  }

  /** Abort the run in flight; false when there is none. */
  cancelIndex(): boolean {
    if (!this.controller) return false
    this.controller.abort()
    return true
  }

  /** Run one index pass, or rebuild the whole index from scratch. */
  async index(
    options: { rebuild?: boolean; onProgress?: (progress: IndexProgress) => void; signal?: AbortSignal } = {},
  ): Promise<IndexStats> {
    this.requireModel()
    const stats = options.rebuild === true ? await this.kb.rebuild(options) : await this.kb.index(options)
    this.log(
      `${options.rebuild === true ? "rebuilt" : "indexed"} ${stats.chunks} chunks from ${stats.files} files (${stats.skipped} unchanged)`,
    )
    return stats
  }

  /** Refuse to index with an embedding model that was never downloaded. */
  private requireModel(): string {
    const model = resolveEmbeddingModel()
    if (!findModel(model)) {
      throw new Error(
        `Embedding model "${model}" is not downloaded. Download it from the Models page (task "feature-extraction").`,
      )
    }
    return model
  }
}
