import { KnowledgeBase, resolveEmbeddingModel } from "@nyx/knowledge"
import { find } from "@nyx/llm"
import type { KnowledgeSearchHit } from "../shared/types"

/**
 * Owns the single local knowledge base (Markdown files under the nyx knowledge
 * dir, `~/.nyx/knowledge` by default). Indexing
 * runs the local ONNX embedding model, so it is CPU-bound: `ensureIndexed()`
 * runs once per process in the background, while `search()` awaits readiness.
 * If the embedding model isn't downloaded, indexing is skipped and `search()`
 * reports a hint instead of downloading it.
 */
export class KnowledgeService {
  private readonly kb = KnowledgeBase.open()
  private indexed?: Promise<void>
  private unavailable?: string

  /** Incrementally index the knowledge dir, at most once per process. */
  ensureIndexed(): Promise<void> {
    this.indexed ??= this.run()
    return this.indexed
  }

  /** True when the knowledge dir holds at least one `.md` file. */
  hasDocuments(): boolean {
    return this.kb.hasDocuments()
  }

  /** Hybrid search over the index, waiting for the startup index run. */
  async search(query: string, topK = 6): Promise<KnowledgeSearchHit[]> {
    await this.ensureIndexed()
    if (this.unavailable) throw new Error(this.unavailable)
    return this.kb.search(query, { topK })
  }

  private async run(): Promise<void> {
    if (!this.kb.hasDocuments()) return
    const model = resolveEmbeddingModel()
    if (!find(model)) {
      this.unavailable = `Embedding model "${model}" is not downloaded. Run: nyx model pull ${model} --task feature-extraction`
      console.warn(`[knowledge] ${this.unavailable}`)
      return
    }
    try {
      const stats = await this.kb.index()
      console.log(
        `[knowledge] indexed ${stats.chunks} chunks from ${stats.files} files (${stats.skipped} unchanged)`,
      )
    } catch (error) {
      console.warn("[knowledge] indexing failed:", error)
    }
  }
}
