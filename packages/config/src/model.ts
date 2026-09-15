import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defu } from "defu";
import { getConfigDir, getModelsDir } from "./path.ts";
import { ModelConfigSchema } from "./schema.ts";
import type { ModelConfig, ModelInfo } from "./types.ts";

function getModelConfigPath(): string {
  return join(getConfigDir(), "models.json");
}

/** Parse a JSON file leniently; undefined when missing or malformed. */
function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return undefined;
  }
}

/**
 * Read the installed-model config. Falls back to an empty registry when the
 * file is missing/invalid; known keys are validated, unknown keys are kept
 * (`.loose()`) so a later `writeModelConfig()` doesn't drop them.
 */
export function readModelConfig(): ModelConfig {
  const raw = readJson(getModelConfigPath());
  const parsed = ModelConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : { provider: {} };
}

/** Deep-merge one installed model into the config file (via defu). */
export function writeModelConfig(entry: { provider: Record<string, { models: Record<string, ModelInfo> }> }): void {
  const merged = defu(readModelConfig(), entry);
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getModelConfigPath(), JSON.stringify(merged, null, 2));
}

/** Remove one model record from the registry (no-op when absent). */
export function removeModelRecord(modelId: string): void {
  const config = readModelConfig();
  let changed = false;
  for (const [org, { models }] of Object.entries(config.provider)) {
    for (const name of Object.keys(models)) {
      if (models[name]?.id === modelId) {
        delete models[name];
        changed = true;
      }
    }
    if (changed && Object.keys(models).length === 0) {
      delete config.provider[org];
    }
    if (changed) break;
  }
  if (changed) {
    writeFileSync(getModelConfigPath(), JSON.stringify(config, null, 2));
  }
}

/**
 * Remove an installed model from disk and registry. Expects a full
 * `org/name` id; no-op when the model is not on disk.
 */
export function removeModel(modelId: string): boolean {
  const [org, ...rest] = modelId.split("/");
  const name = rest.join("/");
  if (!org || !name) return false;
  const dir = join(getModelsDir(), org, name);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  // Drop the org dir too when it's now empty.
  const orgDir = join(getModelsDir(), org);
  if (existsSync(orgDir) && readdirSafe(orgDir).length === 0) {
    rmSync(orgDir, { recursive: true, force: true });
  }
  removeModelRecord(modelId);
  return true;
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
