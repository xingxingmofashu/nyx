/**
 * `nyx model list` — list locally cached ONNX models grouped by task.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { cmd } from "../../utils/cmd";
import { getModelsDir, readModelMetaMap } from "@nyx/config";
import { log } from "@clack/prompts";

interface CachedModel {
  id: string;
  task: string;
  dtype?: string;
}

function getCachedModels(): CachedModel[] {
  const modelsDir = getModelsDir();
  const models: CachedModel[] = [];
  const metaMap = readModelMetaMap();

  let orgs: string[] = [];
  try {
    orgs = readdirSync(modelsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return models;
  }

  for (const org of orgs) {
    const orgDir = join(modelsDir, org);
    let names: string[] = [];
    try {
      names = readdirSync(orgDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      continue;
    }
    for (const name of names) {
      const id = `${org}/${name}`;
      const meta = metaMap[id];
      models.push({ id, task: meta?.task ?? "unknown", dtype: meta?.dtype });
    }
  }

  return models.sort((a, b) => a.id.localeCompare(b.id));
}

export const ModelListCommand = cmd<Record<string, unknown>, Record<string, never>>({
  command: "list",
  aliases: ["ls"],
  describe: "List locally cached models",
  handler: () => {
    let models: CachedModel[];
    try {
      models = getCachedModels();
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
      const list = byTask.get(model.task) ?? [];
      list.push(model);
      byTask.set(model.task, list);
    }

    for (const [task, taskModels] of byTask) {
      log.step(task);
      for (const model of taskModels) {
        log.message(`  ${model.id}${model.dtype ? `  (${model.dtype})` : ""}`);
      }
    }
  },
});
