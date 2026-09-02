import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR_NAME = ".nyx";

/** nyx user config directory (~/.nyx). */
export function getConfigDir(): string {
  return join(homedir(), CONFIG_DIR_NAME);
}

/**
 * Directory where model weights are cached.
 * Overridable via NYX_MODELS_DIR (e.g. for tests or shared caches).
 */
export function getModelsDir(): string {
  return process.env.NYX_MODELS_DIR ?? join(getConfigDir(), "models");
}

/** Absolute directory for a cached model id of the form `org/name`. */
export function getModelDir(modelId: string): string {
  return join(getModelsDir(), modelId);
}

/** Per-model metadata recorded in ~/.nyx/models.json. */
export interface ModelMeta {
  task: string;
  dtype?: string;
  pulledAt: string;
}

export type ModelMetaMap = Record<string, ModelMeta>;

function getModelsJsonPath(): string {
  return join(getConfigDir(), "models.json");
}

/** Read the full model metadata registry (empty object when absent/corrupt). */
export function readModelMetaMap(): ModelMetaMap {
  try {
    const raw = readFileSync(getModelsJsonPath(), "utf-8");
    return JSON.parse(raw) as ModelMetaMap;
  } catch {
    return {};
  }
}

export function readModelMeta(modelId: string): ModelMeta | undefined {
  return readModelMetaMap()[modelId];
}

/** Update the metadata registry entry for one model id. */
export function writeModelMeta(modelId: string, meta: ModelMeta): void {
  const all = readModelMetaMap();
  all[modelId] = meta;
  const configDir = getConfigDir();
  mkdirSync(configDir, { recursive: true });
  writeFileSync(getModelsJsonPath(), JSON.stringify(all, null, 2));
}
