/**
 * `nyx model list` — list locally cached ONNX models.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cmd } from "../../utils/cmd";
import { getModelsDir } from "@nyx/config";
import { log } from "@clack/prompts";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

function dirSize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += dirSize(full);
    } else {
      try {
        total += statSync(full).size;
      } catch {
        // ignore unreadable files
      }
    }
  }
  return total;
}

function getCachedModels(): Array<{ id: string; sizeBytes: number }> {
  const modelsDir = getModelsDir();
  const models: Array<{ id: string; sizeBytes: number }> = [];

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
      models.push({ id: `${org}/${name}`, sizeBytes: dirSize(join(orgDir, name)) });
    }
  }

  return models.sort((a, b) => a.id.localeCompare(b.id));
}

export const ModelListCommand = cmd<Record<string, unknown>, Record<string, never>>({
  command: "list",
  aliases: ["ls"],
  describe: "List locally cached models",
  handler: () => {
    const models = getCachedModels();
    if (models.length === 0) {
      log.info("No models cached yet. Use `nyx model pull <model> --task <task>` to download one.");
      return;
    }

    const idWidth = Math.max(...models.map((m) => m.id.length), 4);
    log.info("Locally cached models:");
    for (const model of models) {
      console.log(`  ${model.id.padEnd(idWidth)}  ${formatBytes(model.sizeBytes).padStart(8)}`);
    }
  },
});
