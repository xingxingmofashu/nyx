/**
 * `nyx knowledge` — manage local knowledge bases (RAG): add a folder of
 * Markdown/text, index it with the local ONNX embedding model, and search it.
 */

import { cmd } from "../../utils/cmd";
import { AddCommand } from "./add";
import { IndexCommand } from "./index-cmd";
import { KnowledgeListCommand } from "./list";
import { RemoveCommand } from "./remove";
import { SearchCommand } from "./search";

export const KnowledgeCommand = cmd<Record<string, unknown>, Record<string, unknown>>({
  command: "knowledge",
  aliases: ["kb"],
  describe: "Manage local knowledge bases (RAG)",
  builder: (yargs) =>
    yargs
      .command(AddCommand)
      .command(IndexCommand)
      .command(SearchCommand)
      .command(KnowledgeListCommand)
      .command(RemoveCommand)
      .demandCommand(1, "Specify a subcommand"),
  handler: async () => {},
});
