/**
 * `nyx knowledge index [id]` — (re)index a knowledge base's source folder.
 * Defaults to the only knowledge base when `id` is omitted.
 */

import { cmd } from "../../utils/cmd";
import { KnowledgeBase, listKnowledgeBases } from "@nyx/knowledge";
import { log, spinner } from "@clack/prompts";

interface IndexArgs {
  id?: string;
}

export const IndexCommand = cmd<Record<string, unknown>, IndexArgs>({
  command: "index [id]",
  describe: "Index (or re-index) a knowledge base",
  builder: (yargs) => yargs.positional("id", { type: "string", describe: "Knowledge base id" }),
  handler: async (args) => {
    const id = resolveId(args.id);
    const spin = spinner();
    spin.start("Indexing...");
    try {
      const stats = await KnowledgeBase.open(id).index({
        onProgress: (p) => {
          if (p.phase === "done") return;
          spin.message(`Embedding ${p.file ?? ""} (${p.filesDone}/${p.filesTotal})`);
        },
      });
      spin.stop(`Indexed ${stats.chunks} chunks from ${stats.files} files (${stats.skipped} unchanged)`);
    } catch (error) {
      spin.stop("Index failed");
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
});

/** Use the given id, else the only configured knowledge base. */
export function resolveId(id: string | undefined): string {
  if (id) return id;
  const bases = listKnowledgeBases();
  if (bases.length === 1) return bases[0]!.id;
  if (bases.length === 0) {
    log.error("No knowledge bases yet. Create one with `nyx knowledge add <dir>`.");
  } else {
    log.error(`Specify a knowledge base id: ${bases.map((b) => b.id).join(", ")}`);
  }
  process.exit(1);
}
