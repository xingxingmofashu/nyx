import { tool, type ToolSet } from "ai"
import { z } from "zod/v4"
import type { KnowledgeSearchHit } from "../services/knowledge.ts"
import type { Knowledge } from "../services/knowledge.ts"
import DESCRIPTION from "./search-knowledge.txt"

export class SearchKnowledge {
  private static readonly MAX_OUTPUT = 40_000

  static create(service: Knowledge, present: boolean): ToolSet {
    if (!present) return {}

    return {
      search_knowledge: tool({
        description: DESCRIPTION,
        inputSchema: z.object({
          query: z.string().describe("Natural-language search query"),
          topK: z
            .number()
            .int()
            .positive()
            .max(20)
            .optional()
            .describe("Number of passages to return (default 6)"),
        }),
        execute: async ({ query, topK }) => {
          let hits: KnowledgeSearchHit[]
          try {
            hits = await service.search(query, topK ?? 6)
          } catch (error) {
            return error instanceof Error ? error.message : String(error)
          }
          if (hits.length === 0) return "No relevant passages found in the knowledge base."
          return SearchKnowledge.truncate(hits.map((hit) => hit.text).join("\n\n"))
        },
      }),
    }
  }

  private static truncate(value: string): string {
    return value.length > SearchKnowledge.MAX_OUTPUT
      ? `${value.slice(0, SearchKnowledge.MAX_OUTPUT)}\n… (truncated)`
      : value
  }
}
