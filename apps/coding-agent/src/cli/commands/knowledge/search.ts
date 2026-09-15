/**
 * `nyx knowledge search <query>` — hybrid (vector + keyword) search over one or
 * all knowledge bases.
 */

import { cmd } from "../../utils/cmd";
import { KnowledgeBase, listKnowledgeBases } from "@nyx/knowledge";
import { log, spinner } from "@clack/prompts";

interface SearchArgs {
  query?: string;
  kb?: string;
  "top-k"?: number;
}

export const SearchCommand = cmd<Record<string, unknown>, SearchArgs>({
  command: "search <query>",
  describe: "Search knowledge bases",
  builder: (yargs) =>
    yargs
      .positional("query", { type: "string", describe: "Search query" })
      .option("kb", { type: "string", describe: "Restrict to one knowledge base id" })
      .option("top-k", { type: "number", default: 6, describe: "Number of passages to return" }),
  handler: async (args) => {
    if (!args.query) {
      log.error("Usage: nyx knowledge search <query> [--kb <id>] [--top-k <n>]");
      process.exit(1);
    }
    const topK = args["top-k"] ?? 6;
    const spin = spinner();
    spin.start("Searching...");
    try {
      const bases = args.kb
        ? [KnowledgeBase.open(args.kb).config]
        : listKnowledgeBases();
      if (bases.length === 0) {
        spin.stop("No knowledge bases");
        log.error("No knowledge bases yet. Create one with `nyx knowledge add <dir>`.");
        process.exit(1);
      }
      const hits = (
        await Promise.all(
          bases.map(async (base) =>
            (await KnowledgeBase.open(base.id).search(args.query!, { topK })).map((hit) => ({
              base: base.name,
              ...hit,
            })),
          ),
        )
      )
        .flat()
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      spin.stop(`${hits.length} result(s)`);

      for (const [index, hit] of hits.entries()) {
        const where = hit.heading ? `${hit.file} › ${hit.heading}` : hit.file;
        log.step(`[${index + 1}] ${hit.base} — ${where} (score ${hit.score.toFixed(4)})`);
        log.message(hit.text);
      }
    } catch (error) {
      spin.stop("Search failed");
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
});
