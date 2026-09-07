/**
 * `nyx model remove <model>` — delete a cached model from disk and registry.
 */

import { cmd } from "../../utils/cmd";
import { remove } from "@nyx/config";
import { log, confirm } from "@clack/prompts";

interface RemoveArgs {
  model?: string;
  yes?: boolean;
}

export const RemoveCommand = cmd<Record<string, unknown>, RemoveArgs>({
  command: "remove <model>",
  describe: "Remove a cached model from disk and the registry",
  builder: (yargs) =>
    yargs
      .positional("model", { type: "string", describe: "Model id (org/name)" })
      .option("yes", {
        type: "boolean",
        alias: "y",
        describe: "Skip confirmation",
        default: false,
      }),
  handler: async (args: RemoveArgs) => {
    const model = args.model;
    if (!model) {
      log.error("Usage: nyx model remove <model> [--yes]");
      process.exit(1);
    }

    const proceed =
      args.yes ?? (await confirm({ message: `Remove ${model}?`, initialValue: false }));
    if (!proceed) {
      log.info("Aborted.");
      return;
    }

    const removed = remove(model);
    if (removed) {
      log.success(`Removed ${model}`);
    } else {
      log.error(`Model not found: ${model}`);
      process.exit(1);
    }
  },
});
