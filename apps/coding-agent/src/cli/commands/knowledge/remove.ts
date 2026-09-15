/**
 * `nyx knowledge remove <id>` — delete a knowledge base and its index.
 */

import { cmd } from "../../utils/cmd";
import { getKnowledgeBase, removeKnowledgeBase } from "@nyx/knowledge";
import { confirm, log } from "@clack/prompts";

interface RemoveArgs {
  id?: string;
  yes?: boolean;
}

export const RemoveCommand = cmd<Record<string, unknown>, RemoveArgs>({
  command: "remove <id>",
  aliases: ["rm"],
  describe: "Delete a knowledge base and its index",
  builder: (yargs) =>
    yargs
      .positional("id", { type: "string", describe: "Knowledge base id" })
      .option("yes", { alias: "y", type: "boolean", describe: "Skip confirmation" }),
  handler: async (args) => {
    if (!args.id) {
      log.error("Usage: nyx knowledge remove <id>");
      process.exit(1);
    }
    const config = getKnowledgeBase(args.id);
    if (!config) {
      log.error(`Unknown knowledge base: ${args.id}`);
      process.exit(1);
    }
    if (!args.yes) {
      const ok = await confirm({ message: `Delete knowledge base "${config.name}" and its index?` });
      if (ok !== true) return;
    }
    removeKnowledgeBase(config.id);
    log.success(`Removed ${config.name} (${config.id})`);
  },
});
