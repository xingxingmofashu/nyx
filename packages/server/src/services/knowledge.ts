import { KnowledgeBase, resolveEmbeddingModel } from "@nyx/knowledge"
import { find } from "@nyx/llm"
import type { KnowledgeSearchHit } from "../shared/types"

/**
 * Owns the single local knowledge base (Markdown files under the nyx knowledge
 * dir, `~/.nyx/knowledge` by default). Indexing runs the local ONNX embedding
 * model, so it is CPU-bound: `ensureIndexed()` runs once per process in the
 * background, while `search()` awaits readiness. If the embedding model isn't
 * downloaded, indexing is skipped and `search()` reports a hint instead of
 * downloading it.
 *
 * Logging is injected and defaults to silent: the CLI runs this server
 * in-process while a TUI owns the terminal, so writing to stdout/stderr there
 * would corrupt the render. The standalone binary passes a stderr logger.
 */
export class KnowledgeService {
  private readonly kb = KnowledgeBase.open()
  private indexed?: Promise<void>
  private unavailable?: string

  constructor(private readonly log: (message: string) => void = () => {}) {}

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
      this.log(this.unavailable)
      return
    }
    try {
      const stats = await this.kb.index()
      this.log(`indexed ${stats.chunks} chunks from ${stats.files} files (${stats.skipped} unchanged)`)
    } catch (error) {
      this.log(`indexing failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
