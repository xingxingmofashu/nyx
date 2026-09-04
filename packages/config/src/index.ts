import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defu } from "defu";
import type { ModelInfo, ModelConfig } from "./types.ts";

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

/** Deep-merge one installed model into the config file (via defu). */
export function write(entry: { provider: Record<string, { models: Record<string, ModelInfo> }> }): void {
  const merged = defu(read(), entry);
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getModelConfigPath(), JSON.stringify(merged, null, 2));
}

export * from "./types.ts";
