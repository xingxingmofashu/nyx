/**
 * `nyx knowledge list` — list knowledge bases with their index status.
 */

import { cmd } from "../../utils/cmd";
import { KnowledgeBase, listKnowledgeBases } from "@nyx/knowledge";
import { log } from "@clack/prompts";

export const KnowledgeListCommand = cmd<Record<string, unknown>, Record<string, never>>({
  command: "list",
  aliases: ["ls"],
  describe: "List knowledge bases",
  handler: () => {
    const bases = listKnowledgeBases();
    if (bases.length === 0) {
      log.info("No knowledge bases yet. Create one with `nyx knowledge add <dir>`.");
      return;
    }
    for (const base of bases) {
      const files = KnowledgeBase.open(base.id).fileCount();
      log.step(`${base.name}  (${base.id})`);
      log.message(`  ${base.sourceDir}`);
      log.message(`  model: ${base.embeddingModel}${base.dim ? ` (${base.dim}d)` : ""}  files: ${files}`);
    }
  },
});
