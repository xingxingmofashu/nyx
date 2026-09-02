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
