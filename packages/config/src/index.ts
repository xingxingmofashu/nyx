import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defu } from "defu";
import { getConfigDir } from "./paths.ts";
import { AgentHeadersSchema, ModelConfigSchema, SettingsSchema } from "./schemas.ts";
import type { ModelInfo, ModelConfig, Settings, AgentSettings } from "./types.ts";

/** Model weight cache dir; overridable via NYX_MODELS_DIR. */
export function getModelsDir(): string {
  return process.env.NYX_MODELS_DIR ?? join(getConfigDir(), "models");
}

/** Knowledge-base storage dir; overridable via NYX_KNOWLEDGE_DIR. */
export function getKnowledgeDir(): string {
  return process.env.NYX_KNOWLEDGE_DIR ?? join(getConfigDir(), "knowledge");
}

function getModelConfigPath(): string {
  return join(getConfigDir(), "models.json");
}

function getSettingsPath(): string {
  return join(getConfigDir(), "settings.json");
}

/** Default endpoint; clears to this when a user blanks the mirror. */
export const DEFAULT_HUB_URL = "https://huggingface.co";

/** Parse a JSON file leniently; undefined when missing or malformed. */
function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read the installed-model config. Falls back to an empty registry when the
 * file is missing/invalid; known keys are validated, unknown keys are kept
 * (`.loose()`) so a later `write()` doesn't drop them.
 */
export function read(): ModelConfig {
  const raw = readJson(getModelConfigPath());
  const parsed = ModelConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : { provider: {} };
}

/**
 * Read user settings. On a schema mismatch the raw object is returned rather
 * than `{}`, so an unrelated invalid field can't be silently discarded by the
 * next `setSettings()` read-modify-write.
 */
export function getSettings(): Settings {
  const raw = readJson(getSettingsPath());
  const parsed = SettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return isPlainObject(raw) ? (raw as Settings) : {};
}

/** Deep-merge a settings patch into ~/.nyx/settings.json (via defu). */
export function setSettings(patch: Settings): Settings {
  const merged = defu(patch, getSettings());
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getSettingsPath(), JSON.stringify(merged, null, 2));
  return merged;
}

/**
 * Agent settings from ~/.nyx/settings.json, with env overrides: NYX_AGENT_MODEL
 * replaces the model ref, and NYX_AGENT_{API_KEY,BASE_URL,HEADERS} override the
 * active provider's `options` (the active provider is the model ref's prefix).
 */
export function getAgentSettings(): AgentSettings {
  const agent = getSettings().agent ?? {};
  const model = process.env.NYX_AGENT_MODEL ?? agent.model;

  const envOptions: Record<string, unknown> = {};
  if (process.env.NYX_AGENT_API_KEY) envOptions.apiKey = process.env.NYX_AGENT_API_KEY;
  if (process.env.NYX_AGENT_BASE_URL) envOptions.baseURL = process.env.NYX_AGENT_BASE_URL;
  const envHeaders = parseHeadersEnv(process.env.NYX_AGENT_HEADERS);
  if (envHeaders) envOptions.headers = envHeaders;

  const provider = { ...(agent.provider ?? {}) };
  const providerId = providerIdOf(model);
  const entry = providerId ? provider[providerId] : undefined;
  if (providerId && entry && Object.keys(envOptions).length > 0) {
    provider[providerId] = { ...entry, options: { ...(entry.options ?? {}), ...envOptions } };
  }

  const tools = { ...(agent.tools ?? {}) };
  // Only a recognized on/off value overrides settings; ignore empty/unknown so
  // an exported-but-blank var can't clobber `tools.localModels: true`.
  const envLocalModels = process.env.NYX_AGENT_LOCAL_MODELS?.toLowerCase();
  if (envLocalModels === "1" || envLocalModels === "true") tools.localModels = true;
  else if (envLocalModels === "0" || envLocalModels === "false") tools.localModels = false;

  return { ...agent, model, provider, tools };
}

/** Provider id from a `<providerId>/<modelId>` ref (undefined when malformed). */
export function providerIdOf(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : undefined;
}

/** Parse NYX_AGENT_HEADERS (a JSON string map); undefined when unset or malformed. */
function parseHeadersEnv(value: string | undefined): Record<string, string> | undefined {
  if (!value) return undefined;
  try {
    const parsed = AgentHeadersSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
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

export { getConfigDir } from "./paths.ts";
export * from "./sessions.ts";
export * from "./types.ts";
