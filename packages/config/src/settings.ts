import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defu } from "defu";
import { isPlainObject, readJson } from "./json.ts";
import { getConfigDir } from "./path.ts";
import { AgentHeadersSchema, SettingsSchema } from "./schema.ts";
import type { AgentSettings, Settings } from "./types.ts";

/** Default endpoint; clears to this when a user blanks the mirror. */
export const DEFAULT_HUB_URL = "https://huggingface.co";

function getSettingsPath(): string {
  return join(getConfigDir(), "settings.json");
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
 * Replace ~/.nyx/settings.json wholesale.
 *
 * `setSettings` deep-merges, so it can never remove a key; the Settings UI needs
 * to delete providers and clear fields, so it round-trips the full object
 * (`getSettings()` + edits) through here. Validation is lenient, matching
 * `getSettings`: a hand-edited config that no longer matches the schema is
 * written back as-is rather than rejected.
 */
export function writeSettings(settings: Settings): Settings {
  const parsed = SettingsSchema.safeParse(settings);
  const next = parsed.success ? parsed.data : settings;
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2));
  return next;
}

/**
 * Agent settings from ~/.nyx/settings.json, with env overrides: NYX_AGENT_MODEL
 * replaces the model ref, NYX_AGENT_{API_KEY,BASE_URL,HEADERS} override the
 * active provider's `options` (the active provider is the model ref's prefix),
 * and NYX_AGENT_{LOCAL_MODELS,WEB_SEARCH} toggle the matching tool.
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
  const envWebSearch = process.env.NYX_AGENT_WEB_SEARCH?.toLowerCase();
  if (envWebSearch === "1" || envWebSearch === "true") tools.webSearch = true;
  else if (envWebSearch === "0" || envWebSearch === "false") tools.webSearch = false;

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
