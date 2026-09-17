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
import { findModel, listModels } from "@nyx/llm"
import type { KnowledgeSearchHit, KnowledgeStatus } from "../schema"

/**
 * Owns the single local knowledge base (Markdown files under the nyx knowledge
 * dir, `~/.nyx/knowledge` by default) and is the only writer of its index.
 * Indexing runs a local ONNX embedding model the user selected — there is no
 * default, so with none selected (or one that was never downloaded) indexing
 * and search are refused instead of silently picking a model. It is CPU-bound,
 * and it is never implicit: nothing embeds at server startup or on a query.
 * Only the desktop's Knowledge page starts a run, through
 * `beginIndex()`/`endIndex()` — one run at a time, cancellable between files,
 * with progress streamed to the caller. Importing and deleting documents never
 * index on their own either.
 *
 * Logging is injected: the server binary passes a stderr logger, which the
 * desktop captures behind the app.
 */
export class KnowledgeService {
  private controller?: AbortController

  constructor(private readonly log: (message: string) => void) {}

  /**
   * The base is re-opened per use so a settings change (the embedding model is
   * picked on the Knowledge page) is visible without restarting the server.
   */
  private get kb(): KnowledgeBase {
    return KnowledgeBase.open()
  }

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
    const kb = this.kb
    if (kb.fileCount() === 0) {
      throw new Error("The knowledge index is empty. Build it from the Knowledge page (Update index).")
    }
    this.requireModel()
    return kb.search(query, { topK })
  }

  /** Everything the knowledge management page shows at a glance. */
  async status(): Promise<KnowledgeStatus> {
    const kb = this.kb
    const embeddingModel = resolveEmbeddingModel()
    const { indexedModel, updatedAt } = kb.config
    // A missing or unreadable index is 0 chunks, not an error: the page then
    // offers to build one.
    const chunks = await kb.countChunks().catch(() => 0)
    return {
      dir: getKnowledgeDir(),
      ...(embeddingModel !== undefined ? { embeddingModel } : {}),
      ...(indexedModel !== undefined ? { indexedModel } : {}),
      modelDownloaded: embeddingModel !== undefined && findModel(embeddingModel) !== undefined,
      availableEmbeddingModels: listModels()
        .filter((model) => model.task === "feature-extraction")
        .map((model) => model.id),
      documents: kb.listDocuments().length,
      indexed: kb.fileCount(),
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
    const kb = this.kb
    const stats = options.rebuild === true ? await kb.rebuild(options) : await kb.index(options)
    this.log(
      `${options.rebuild === true ? "rebuilt" : "indexed"} ${stats.chunks} chunks from ${stats.files} files (${stats.skipped} unchanged)`,
    )
    return stats
  }

  /** Refuse to embed without a selected embedding model that is downloaded. */
  private requireModel(): string {
    const model = resolveEmbeddingModel()
    if (!model) {
      throw new Error(
        'No embedding model is selected. Download one from the Local models page (task "feature-extraction") and pick it above.',
      )
    }
    if (!findModel(model)) {
      throw new Error(
        `Embedding model "${model}" is not downloaded. Download it from the Local models page (task "feature-extraction").`,
      )
    }
    return model
  }
}
