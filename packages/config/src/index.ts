import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ModelMetaMapSchema, ModelMetaSchema, type ModelMeta, type ModelMetaMap } from "./schema.ts";

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

function getModelsJsonPath(): string {
  return join(getConfigDir(), "models.json");
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Read the full model metadata registry.
 * Returns an empty object when no models.json exists yet; throws when the
 * file exists but cannot be read or fails schema validation (corruption should
 * not be silently ignored).
 */
export function readModelMetaMap(): ModelMetaMap {
  let raw: string;
  try {
    raw = readFileSync(getModelsJsonPath(), "utf-8");
  } catch (error) {
    if (isNotFoundError(error)) return {};
    throw new Error(`Failed to read ${getModelsJsonPath()}: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    return ModelMetaMapSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new Error(`models.json is corrupted: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function readModelMeta(modelId: string): ModelMeta | undefined {
  return readModelMetaMap()[modelId];
}

// Serialize read-modify-write cycles so concurrent writeModelMeta calls in the
// same process cannot lose entries. Cross-process pulls are not locked (a
// single-user CLI trade-off); pi uses proper-lockfile for that case.
let writeChain: Promise<void> = Promise.resolve();
/** Update the metadata registry entry for one model id. */
export function writeModelMeta(modelId: string, meta: ModelMeta): Promise<void> {
  const validated = ModelMetaSchema.parse(meta);
  const task = writeChain.then(() => {
    const all = readModelMetaMap();
    all[modelId] = validated;
    const configDir = getConfigDir();
    mkdirSync(configDir, { recursive: true });
    writeFileSync(getModelsJsonPath(), JSON.stringify(all, null, 2));
  });
  // Keep the chain alive even when a write fails; rejections surface to the caller.
  writeChain = task.catch(() => {});
  return task;
}

export * from "./schema.ts";
