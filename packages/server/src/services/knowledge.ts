import {
  createKnowledgeBase,
  KnowledgeBase,
  listKnowledgeBases,
  removeKnowledgeBase,
  type IndexProgress,
} from "@nyx/knowledge"
import type {
  KnowledgeBaseInfo,
  KnowledgeCreateRequest,
  KnowledgeSearchHit,
} from "../shared/types"

/**
 * Owns the local knowledge bases: create/remove, (re)index a source directory,
 * and hybrid search. Indexing runs the local ONNX embedding model, so it is
 * CPU-bound and reported through a progress callback (streamed as SSE).
 */
export class KnowledgeService {
  list(): KnowledgeBaseInfo[] {
    return listKnowledgeBases().map(toInfo)
  }

  create(input: KnowledgeCreateRequest): KnowledgeBaseInfo {
    return toInfo(createKnowledgeBase(input))
  }

  remove(id: string): boolean {
    return removeKnowledgeBase(id)
  }

  /** Index one knowledge base, reporting per-file progress. */
  async index(
    id: string,
    options: { onProgress?: (progress: IndexProgress) => void; signal?: AbortSignal } = {},
  ): Promise<{ files: number; chunks: number; skipped: number }> {
    return KnowledgeBase.open(id).index(options)
  }

  /** Hybrid search within one knowledge base. */
  async search(id: string, query: string, topK = 6): Promise<KnowledgeSearchHit[]> {
    const kb = KnowledgeBase.open(id)
    const hits = await kb.search(query, { topK })
    return hits.map((hit) => ({ knowledgeBase: kb.config.name, ...hit }))
  }

  /** Search across every knowledge base, merging hits by score. */
  async searchAll(query: string, topK = 6): Promise<KnowledgeSearchHit[]> {
    const bases = listKnowledgeBases()
    const results = await Promise.all(
      bases.map(async (config) => {
        try {
          const hits = await KnowledgeBase.open(config.id).search(query, { topK })
          return hits.map((hit) => ({ knowledgeBase: config.name, ...hit }))
        } catch (error) {
          // One broken base (e.g. missing embedding model) must not fail the rest.
          console.warn(`knowledge search failed for "${config.name}":`, error)
          return []
        }
      }),
    )
    return results
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }
}

function toInfo(config: {
  id: string
  name: string
  sourceDir: string
  embeddingModel: string
  dim?: number
  createdAt: string
  updatedAt: string
}): KnowledgeBaseInfo {
  return {
    id: config.id,
    name: config.name,
    sourceDir: config.sourceDir,
    embeddingModel: config.embeddingModel,
    ...(config.dim !== undefined ? { dim: config.dim } : {}),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }
}
