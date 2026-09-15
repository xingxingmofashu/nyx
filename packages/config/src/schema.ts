import { z } from "zod/v4";
import type { DataType, PipelineType } from "@huggingface/transformers";

/**
 * Zod schemas for the on-disk config (`settings.json`, `models.json`). They are
 * the single source of truth: the exported types are `z.infer`red from them.
 * Reads are lenient — a value that fails validation falls back to a default
 * instead of throwing, so a hand-edited config can never crash the app.
 */

/** Options forwarded to an AI SDK provider factory (baseURL, apiKey, headers, …). */
export const AgentProviderOptionsSchema = z
  .object({
    baseURL: z.string().optional(),
    apiKey: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .catchall(z.unknown());

export const AgentProviderLimitSchema = z
  .object({
    /** Context window (stored as metadata only). */
    context: z.union([z.number(), z.string()]).optional(),
    /** Max output tokens, forwarded to the model. */
    output: z.number().optional(),
  })
  .loose();

/** One provider definition (opencode-style): an AI SDK package + its options. */
export const AgentProviderEntrySchema = z
  .object({
    /** AI SDK provider package, e.g. "@ai-sdk/openai-compatible" or "@ai-sdk/anthropic". */
    npm: z.string(),
    /** Display name. */
    name: z.string().optional(),
    /** URL listing available models; defaults to `${options.baseURL}/models`. */
    modelsUrl: z.string().optional(),
    /** Options forwarded to the provider factory. */
    options: AgentProviderOptionsSchema.optional(),
    /** Token limits; `output` caps max output tokens, `context` is metadata only. */
    limit: AgentProviderLimitSchema.optional(),
  })
  .loose();

export const AgentToolsSettingsSchema = z
  .object({
    /** Expose locally installed ONNX models as tools the brain may call (default true; only added when models exist). */
    localModels: z.boolean().optional(),
    /** Expose `search_knowledge` over indexed knowledge bases (default true when any exist). */
    knowledge: z.boolean().optional(),
    /** Expose the `web_search` / `web_fetch` tools (default true). */
    webSearch: z.boolean().optional(),
  })
  .loose();

/** Local knowledge-base (RAG) configuration. */
export const KnowledgeSettingsSchema = z
  .object({
    /** ONNX embedding model id used to index/search knowledge bases. */
    embeddingModel: z.string().optional(),
  })
  .loose();

/** Remote brain configuration; every field can be overridden by an env var. */
export const AgentSettingsSchema = z
  .object({
    /** Active model as `<providerId>/<modelId>`, e.g. "opencode/mimo-v2.5". */
    model: z.string().optional(),
    /** Named provider definitions the model ref resolves against. */
    provider: z.record(z.string(), AgentProviderEntrySchema).optional(),
    /** Per-tool toggles for the agent. */
    tools: AgentToolsSettingsSchema.optional(),
    /** Directory the agent's coding tools are confined to (default: process cwd). */
    workspaceDir: z.string().optional(),
    systemPrompt: z.string().optional(),
    maxSteps: z.number().optional(),
  })
  .loose();

/** App-level user settings, persisted at ~/.nyx/settings.json. */
export const SettingsSchema = z
  .object({
    /** Hugging Face endpoint used for model downloads (mirror override). */
    hubBaseUrl: z.string().optional(),
    /** Whether models may be fetched from the hub (default true; false = offline, local cache only). */
    allowRemoteModels: z.boolean().optional(),
    /** Remote "master brain" used by the agent; env vars override each field. */
    agent: AgentSettingsSchema.optional(),
    /** Local knowledge-base (RAG) settings. */
    knowledge: KnowledgeSettingsSchema.optional(),
  })
  .loose();

/** Headers map parsed from NYX_AGENT_HEADERS. */
export const AgentHeadersSchema = z.record(z.string(), z.string());

/** A locally installed model record. */
export const ModelInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    task: z.custom<PipelineType>(),
    /** Dtype used when pulling; absent when the transformers.js default was used. */
    dtype: z.custom<DataType>().optional(),
    createdAt: z.string(),
  })
  .loose();

/** Model registry persisted at ~/.nyx/models.json. */
export const ModelConfigSchema = z
  .object({
    provider: z.record(z.string(), z.object({ models: z.record(z.string(), ModelInfoSchema) })),
  })
  .loose();

export type Settings = z.infer<typeof SettingsSchema>;
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;
export type AgentToolsSettings = z.infer<typeof AgentToolsSettingsSchema>;
export type KnowledgeSettings = z.infer<typeof KnowledgeSettingsSchema>;
export type AgentProviderEntry = z.infer<typeof AgentProviderEntrySchema>;
export type AgentProviderOptions = z.infer<typeof AgentProviderOptionsSchema>;
export type AgentProviderLimit = z.infer<typeof AgentProviderLimitSchema>;
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/** Metadata for one saved agent chat session (listed without its transcript). */
export interface ChatSessionMeta {
  id: string;
  /** Display title (auto-derived from the first user message, then renamed by hand). */
  title: string;
  /** Workspace the session belongs to; sessions are stored per workspace. */
  workspaceDir: string;
  /** Pinned sessions sort before the rest. */
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A saved agent chat session with its full AI SDK `UIMessage[]` transcript. */
export interface ChatSession extends ChatSessionMeta {
  /** Kept opaque so `@nyx/config` stays free of the AI SDK dependency. */
  messages: unknown[];
}
