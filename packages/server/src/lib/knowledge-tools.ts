import { z } from "zod/v4"
import type { AgentToolSet } from "@nyx/agent"
import type { KnowledgeSearchHit } from "../shared/types"
import type { KnowledgeService } from "../services/knowledge"

/** Cap on text handed back to the model, in characters. */
const MAX_OUTPUT = 40_000

/**
 * Expose the indexed knowledge bases as a read-only `search_knowledge` tool.
 * Returns [] when no knowledge base exists, so the agent never sees a dead tool.
 */
export function createKnowledgeTools(service: KnowledgeService): AgentToolSet {
  const bases = service.list()
  if (bases.length === 0) return []
  const ids = bases.map((base) => base.id) as [string, ...string[]]
  const catalogue = bases.map((base) => `${base.name} (${base.id})`).join(", ")

  return [
    {
      name: "search_knowledge",
      description:
        "Search the user's local knowledge bases and return the most relevant passages with their sources. " +
        `Use it to ground answers in the user's own documents. Available knowledge bases: ${catalogue}.`,
      approval: "never",
      inputSchema: z.object({
        query: z.string().describe("Natural-language search query"),
        knowledgeBase: z.enum(ids).optional().describe("Restrict the search to one knowledge base id"),
        topK: z.number().int().positive().max(20).optional().describe("Number of passages to return (default 6)"),
      }),
      execute: async ({ query, knowledgeBase, topK }) => {
        const hits = knowledgeBase
          ? await service.search(knowledgeBase, query, topK ?? 6)
          : await service.searchAll(query, topK ?? 6)
        if (hits.length === 0) return "No relevant passages found in the knowledge base."
        const text = hits.map((hit, index) => formatHit(hit, index + 1)).join("\n\n")
        return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (truncated)` : text
      },
    },
  ]
}

function formatHit(hit: KnowledgeSearchHit, index: number): string {
  const where = hit.heading ? `${hit.file} › ${hit.heading}` : hit.file
  return `[${index}] ${hit.knowledgeBase} — ${where} (score ${hit.score.toFixed(4)})\n${hit.text}`
}
