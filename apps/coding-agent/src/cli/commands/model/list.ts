/**
 * `nyx model list` — list locally cached ONNX models grouped by task.
 */

import { cmd } from "../../utils/cmd";
import { list } from "@nyx/llm";
import { log } from "@clack/prompts";

interface CachedModel {
  id: string;
  task: string;
  dtype?: string;
}

export const ModelListCommand = cmd<Record<string, unknown>, Record<string, never>>({
  command: "list",
  aliases: ["ls"],
  describe: "List locally cached models",
  handler: () => {
    let models: CachedModel[];
    try {
      models = list();
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
    if (models.length === 0) {
      log.info("No models cached yet. Use `nyx model pull <model> --task <task>` to download one.");
      return;
    }

    const byTask = new Map<string, CachedModel[]>();
    for (const model of models) {
      const group = byTask.get(model.task) ?? [];
      group.push(model);
      byTask.set(model.task, group);
    }

    for (const [task, taskModels] of byTask) {
      log.step(task);
      for (const model of taskModels) {
        log.message(`  ${model.id}${model.dtype ? `  (${model.dtype})` : ""}`);
      }
    }
  },
});
