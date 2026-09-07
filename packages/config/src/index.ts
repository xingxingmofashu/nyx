import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defu } from "defu";
import type { ModelInfo, ModelConfig, Settings } from "./types.ts";

const CONFIG_DIR_NAME = ".nyx";

function getConfigDir(): string {
  return join(homedir(), CONFIG_DIR_NAME);
}

/** Model weight cache dir; overridable via NYX_MODELS_DIR. */
export function getModelsDir(): string {
  return process.env.NYX_MODELS_DIR ?? join(getConfigDir(), "models");
}

function getModelConfigPath(): string {
  return join(getConfigDir(), "models.json");
}

function getSettingsPath(): string {
  return join(getConfigDir(), "settings.json");
}

/** Default endpoint; clears to this when a user blanks the mirror. */
export const DEFAULT_HUB_URL = "https://huggingface.co";

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Read the installed-model config; empty when no file exists yet. */
export function read(): ModelConfig {
  try {
    return JSON.parse(readFileSync(getModelConfigPath(), "utf-8")) as ModelConfig;
  } catch (error) {
    if (isNotFoundError(error)) return { provider: {} };
    throw error;
  }
}

/** Read user settings; defaults when no file exists yet. */
export function getSettings(): Settings {
  try {
    return JSON.parse(readFileSync(getSettingsPath(), "utf-8")) as Settings;
  } catch (error) {
    if (isNotFoundError(error)) return {};
    throw error;
  }
}

/** Deep-merge a settings patch into ~/.nyx/settings.json (via defu). */
export function setSettings(patch: Settings): Settings {
  const merged = defu(patch, getSettings());
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getSettingsPath(), JSON.stringify(merged, null, 2));
  return merged;
}

/** Deep-merge one installed model into the config file (via defu). */
export function write(entry: { provider: Record<string, { models: Record<string, ModelInfo> }> }): void {
  const merged = defu(read(), entry);
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getModelConfigPath(), JSON.stringify(merged, null, 2));
}

/** Remove one model record from the registry (no-op when absent). */
export function removeRecord(modelId: string): void {
  const config = read();
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
export function remove(modelId: string): boolean {
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
  removeRecord(modelId);
  return true;
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export * from "./types.ts";
