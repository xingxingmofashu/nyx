/**
 * `nyx knowledge add <dir>` — register a folder of Markdown/text as a knowledge base.
 */

import { basename, resolve } from "node:path";
import { cmd } from "../../utils/cmd";
import { createKnowledgeBase } from "@nyx/knowledge";
import { log } from "@clack/prompts";

interface AddArgs {
  dir?: string;
  name?: string;
  "embedding-model"?: string;
}

export const AddCommand = cmd<Record<string, unknown>, AddArgs>({
  command: "add <dir>",
  describe: "Register a folder of Markdown/text files as a knowledge base",
  builder: (yargs) =>
    yargs
      .positional("dir", { type: "string", describe: "Directory with .md/.markdown/.txt files" })
      .option("name", { type: "string", describe: "Display name (default: folder name)" })
      .option("embedding-model", { type: "string", describe: "ONNX embedding model id" }),
  handler: (args) => {
    if (!args.dir) {
      log.error("Usage: nyx knowledge add <dir> [--name <name>]");
      process.exit(1);
    }
    try {
      const config = createKnowledgeBase({
        name: args.name ?? basename(resolve(args.dir)),
        sourceDir: args.dir,
        ...(args["embedding-model"] ? { embeddingModel: args["embedding-model"] } : {}),
      });
      log.success(`Created knowledge base "${config.name}" (${config.id})`);
      log.info(`Index it with: nyx knowledge index ${config.id}`);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
});
