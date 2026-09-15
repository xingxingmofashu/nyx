/**
 * `nyx model list` — list locally cached ONNX models grouped by task.
 */

import { cmd } from "../../cmd";
import { listModels } from "@nyx/llm";
import type { ModelInfo } from "@nyx/config";
import { log } from "@clack/prompts";

export const ModelListCommand = cmd<Record<string, unknown>, Record<string, never>>({
  command: "list",
  aliases: ["ls"],
  describe: "List locally cached models",
  handler: () => {
    let models: ModelInfo[];
    try {
      models = listModels();
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
    if (models.length === 0) {
      log.info("No models cached yet. Use `nyx model pull <model> --task <task>` to download one.");
      return;
    }

    const byTask = new Map<string, ModelInfo[]>();
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
