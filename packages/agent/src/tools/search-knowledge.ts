import { tool, type ToolSet } from "ai"
import { z } from "zod/v4"
import type { KnowledgeSearchHit } from "../schema"
import type { KnowledgeService } from "../services/knowledge"
import DESCRIPTION from "./search-knowledge.txt"

/** Cap on text handed back to the model, in characters. */
const MAX_OUTPUT = 40_000

/**
 * Expose the local knowledge base as a read-only `search_knowledge` tool.
 * Returns {} when there are no Markdown documents, so the agent never sees a
 * dead tool.
 */
export async function createKnowledgeTools(service: KnowledgeService): Promise<ToolSet> {
  if (!(await service.hasDocuments())) return {}

  return {
    search_knowledge: tool({
      description: DESCRIPTION,
      inputSchema: z.object({
        query: z.string().describe("Natural-language search query"),
        topK: z.number().int().positive().max(20).optional().describe("Number of passages to return (default 6)"),
      }),
      execute: async ({ query, topK }) => {
        let hits: KnowledgeSearchHit[]
        try {
          hits = await service.search(query, topK ?? 6)
        } catch (error) {
          // e.g. the embedding model isn't downloaded yet; tell the model why.
          return error instanceof Error ? error.message : String(error)
        }
        if (hits.length === 0) return "No relevant passages found in the knowledge base."
        const text = hits.map((hit, index) => formatHit(hit, index + 1)).join("\n\n")
        return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (truncated)` : text
      },
    }),
  }
}

function formatHit(hit: KnowledgeSearchHit, index: number): string {
  const where = hit.heading ? `${hit.file} › ${hit.heading}` : hit.file
  return `[${index}] ${where} (score ${hit.score.toFixed(4)})\n${hit.text}`
}
