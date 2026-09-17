/** Wire types for the nyx inference server HTTP API (shared server/client). */

import { z } from "zod/v4";
import { LLM_TASKS } from "@nyx/llm";
import { Global } from "@nyx/global";
import type { ContextCheckpoint, TokenUsage } from "./types.ts";

export type Settings = Global.Settings;
export type AgentSettings = Global.AgentSettings;
export type AgentToolsSettings = Global.AgentToolsSettings;
export type AgentCompactionSettings = Global.AgentCompactionSettings;
export type KnowledgeSettings = Global.KnowledgeSettings;
export type AgentProviderEntry = Global.AgentProviderEntry;
export type AgentProviderOptions = Global.AgentProviderOptions;
export type AgentProviderLimit = Global.AgentProviderLimit;
export type ModelInfo = Global.ModelInfo;
export type ChatSession = Global.ChatSession;
export type ChatSessionMeta = Global.ChatSessionMeta;

export const SessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

/** PATCH /v1/settings — deep-merge a settings patch. */
export const SettingsPatchSchema = Global.SettingsSchema;
export type SettingsPatch = Global.Settings;

/** PUT /v1/settings — replace the settings file wholesale. */
export const SettingsReplaceSchema = Global.SettingsSchema;
export type SettingsReplace = Global.Settings;

export const WorkspaceQuerySchema = z.object({
  workspaceDir: z.string().optional(),
});

/** PUT /v1/sessions — upsert one session's metadata and transcript. */
export const SessionSaveRequestSchema = z.object({
  workspaceDir: z.string(),
  id: SessionIdSchema,
  title: z.string(),
  messages: z.array(z.unknown()),
});
export type SessionSaveRequest = z.infer<typeof SessionSaveRequestSchema>;

/** PATCH /v1/sessions/:id — rename and/or pin a session. */
export const SessionPatchRequestSchema = z.object({
  workspaceDir: z.string(),
  title: z.string().optional(),
  pinned: z.boolean().optional(),
});
export type SessionPatchRequest = z.infer<typeof SessionPatchRequestSchema>;

/** PUT /v1/sessions/active — remember the last opened session (`null` clears it). */
export const ActiveSessionRequestSchema = z.object({
  workspaceDir: z.string(),
  id: SessionIdSchema.nullable(),
});
export type ActiveSessionRequest = z.infer<typeof ActiveSessionRequestSchema>;

/** GET /v1/files/data-url — read a generated file as a `data:` URL. */
export const GeneratedFileQuerySchema = z.object({
  path: z.string().min(1),
  workspaceDir: z.string().optional(),
});
export type GeneratedFileQuery = z.infer<typeof GeneratedFileQuerySchema>;

/** POST /v1/files/attachments — copy one uploaded attachment into the session folder. */
export const AttachmentSaveRequestSchema = z.object({
  workspaceDir: z.string(),
  sessionId: SessionIdSchema,
  name: z.string(),
  mimeType: z.string(),
  data: z.string(),
});
export type AttachmentSaveRequest = z.infer<typeof AttachmentSaveRequestSchema>;

/** GET /v1/catalog/limit — context-window lookup against the cached models.dev catalog. */
export const CatalogLimitQuerySchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});
export type CatalogLimitQuery = z.infer<typeof CatalogLimitQuerySchema>;

/** GET /v1/environment — on-disk locations. */
export interface AppEnvironment {
  modelsDir: string;
  knowledgeDir: string;
}

/** HTTP image input: base64-encoded image bytes (JSON request body). */
export const ImageBase64InputSchema = z.object({
  /** base64-encoded image bytes. */
  data: z.string(),
  mimeType: z.string(),
});
export type ImageBase64Input = z.infer<typeof ImageBase64InputSchema>;

/** Body of POST /v1/tasks/image-to-image. */
export const ImageToImageRequestSchema = z.object({
  model: z.string().min(1),
  image: ImageBase64InputSchema,
});
export type ImageToImageRequest = z.infer<typeof ImageToImageRequestSchema>;

/** Mono audio samples as they cross the IPC boundary (structured-cloneable). */
export interface AudioSamples {
  /** Mono PCM samples normalized to [-1, 1]. */
  samples: Float32Array;
  /** Sample rate of `samples`, in Hz. */
  samplingRate: number;
}

/** Raw image bytes as they cross the IPC boundary (structured-cloneable). */
export interface ImageBytes {
  /** Raw encoded image bytes (png/jpeg/webp). */
  data: Uint8Array;
  mimeType: string;
}

export interface ImageResult {
  data: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}

/** HTTP text-to-speech input (JSON request body). */
export const TextToSpeechInputSchema = z.object({
  /** Text to synthesize. */
  text: z.string().trim().min(1),
  /** Optional speaker/voice embeddings: a path/URL to a `.bin` file (models that require them). */
  speaker: z.string().optional(),
  /** Optional playback speed (models that support it). */
  speed: z.number().optional(),
});
export type TextToSpeechInput = z.infer<typeof TextToSpeechInputSchema>;

/** Body of POST /v1/tasks/text-to-speech. */
export const TextToSpeechRequestSchema = z.object({
  model: z.string().min(1),
  text: z.string().trim().min(1),
  speaker: z.string().optional(),
  speed: z.number().optional(),
});
export type TextToSpeechRequest = z.infer<typeof TextToSpeechRequestSchema>;

/** Synthesized audio bytes as they cross the IPC boundary (structured-cloneable). */
export interface AudioResult {
  /** Encoded WAV bytes. */
  data: Uint8Array;
  mimeType: string;
  /** Sample rate of the waveform, in Hz. */
  samplingRate: number;
}

/** HTTP automatic-speech-recognition input (JSON request body): mono Float32 PCM. */
export const AutomaticSpeechRecognitionInputSchema = z.object({
  /** base64-encoded little-endian Float32 samples (mono, 16 kHz). */
  audio: z.object({ data: z.string(), samplingRate: z.number() }),
  /** Source language hint; omit to auto-detect. */
  language: z.string().optional(),
  /** `"transcribe"` (default) or `"translate"` (into English). */
  task: z.enum(["transcribe", "translate"]).optional(),
});
export type AutomaticSpeechRecognitionInput = z.infer<typeof AutomaticSpeechRecognitionInputSchema>;

/** Body of POST /v1/tasks/automatic-speech-recognition. */
export const AutomaticSpeechRecognitionRequestSchema = AutomaticSpeechRecognitionInputSchema.extend({
  model: z.string().min(1),
});
export type AutomaticSpeechRecognitionRequest = z.infer<typeof AutomaticSpeechRecognitionRequestSchema>;

/** Transcription result (JSON response body). */
export interface TranscriptResult {
  text: string;
}

/** Body of POST /v1/models/pull. */
export const ModelPullRequestSchema = z.object({
  model: z.string().min(1),
  task: z.enum(LLM_TASKS),
});
export type ModelPullRequest = z.infer<typeof ModelPullRequestSchema>;

/** Body of POST /v1/models/pull/cancel and DELETE /v1/models. */
export const ModelIdRequestSchema = z.object({ model: z.string().min(1) });
export type ModelIdRequest = z.infer<typeof ModelIdRequestSchema>;

/**
 * Agent transcript: the AI SDK UI-message shape, including prior assistant
 * tool calls, their results, and approval responses. Caller-owned; the server
 * is stateless, so the client re-sends the whole transcript each turn.
 */
export type { UIMessage, UIMessageChunk } from "./types.ts";
export type { ContextCheckpoint, TokenUsage } from "./types.ts";

/** One file copied into the workspace's session folder, referenced by a chat attachment. */
export interface SavedAttachment {
  /** Absolute path inside the workspace's session folder. */
  path: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * Metadata a client may put on a user UI message. Descriptors only — never the
 * bytes — so a persisted transcript stays small; the server turns each entry
 * into a workspace-path hint for the agent model.
 */
export interface ChatMessageMetadata {
  attachments?: SavedAttachment[];
  /** Context-compaction checkpoint, set by the server on the assistant message it produced. */
  compaction?: ContextCheckpoint;
  /** Provider-reported token usage, set by the server on each assistant message. */
  usage?: TokenUsage;
  /** The context window the server resolved for this turn (config or models.dev). */
  contextLimit?: number;
  /** Set when a manual compaction could not run because there was nothing older than the newest turn. */
  compactionSkipped?: "too-short";
}

/** Non-transcript options of POST /v1/agent; `messages` is validated by the AI SDK. */
export const AgentOptionsSchema = z.object({
  /** Directory all file/bash tools are confined to; defaults to the server cwd. */
  workspaceDir: z.string().optional(),
  /**
   * Client-generated session id; names generated speech clips so deleting the
   * session also deletes its audio. Omitted for non-session clients.
   */
  sessionId: z.string().optional(),
  /**
   * When true, local speech tools inline the generated audio in their result so
   * the client can play it (e.g. the desktop chat). Omitted, they play it aloud
   * on the server machine instead (for clients that cannot play it inline).
   */
  inlineAudio: z.boolean().optional(),
  /**
   * Compact the transcript before this run even when it fits the context window
   * (the desktop's manual "Compact" action).
   */
  forceCompact: z.boolean().optional(),
});
export type AgentOptions = z.infer<typeof AgentOptionsSchema>;

/**
 * Full POST /v1/agent body. `messages` is only shape-checked here (a non-empty
 * array); the route then validates each entry with the AI SDK's
 * `safeValidateUIMessages`. The schema exists so the RPC client gets a typed
 * request body.
 */
export const AgentRequestSchema = AgentOptionsSchema.extend({
  messages: z.array(z.unknown()).min(1),
});
export type AgentRequestInput = z.infer<typeof AgentRequestSchema>;

/** POST /v1/agent body: one agent run over a full UI-message transcript. */
export interface AgentRequest extends AgentOptions {
  messages: import("./types.ts").UIMessage[];
}

/**
 * POST /v1/agent/compact body: summarize the transcript now, without running a
 * turn (the desktop's "Compact" action). `workspaceDir` is only needed so the
 * estimate counts the same tools the next turn will send.
 */
export const CompactRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
  workspaceDir: z.string().optional(),
  sessionId: z.string().optional(),
});
export type CompactRequestInput = z.infer<typeof CompactRequestSchema>;

/** POST /v1/agent/compact body after the AI SDK validates the messages. */
export interface CompactRequest {
  messages: import("./types.ts").UIMessage[];
  workspaceDir?: string;
  sessionId?: string;
}

/** Result of a manual compaction: the checkpoint to persist, plus its size. */
export interface CompactResponse {
  /** Checkpoint produced by this call, to attach to the newest message; absent on a no-op. */
  checkpoint?: ContextCheckpoint;
  /** True when a new summary was produced. */
  compacted: boolean;
  /** Set when there was nothing older than the newest turn to summarize. */
  skipped?: "too-short";
  /**
   * Heuristic size of the model-facing transcript afterwards, and the same
   * estimate taken before compacting. The client scales these against the
   * provider's last reported usage, so the meter stays on the provider's scale
   * (the raw heuristic over-counts tool schemas).
   */
  estimatedTokens?: number;
  baselineTokens?: number;
}

/** One retrieved passage from the local knowledge base. */
export interface KnowledgeSearchHit {
  /** Path of the source file, relative to the knowledge dir. */
  file: string;
  /** Heading breadcrumb within the file. */
  heading: string;
  text: string;
  /** Reciprocal-rank-fusion score (higher is better). */
  score: number;
}

/** How far one document is from being searchable. */
export type KnowledgeDocumentStatus = "indexed" | "stale" | "new";

/** One Markdown document in the knowledge dir (GET /v1/knowledge/documents). */
export interface KnowledgeDocument {
  /** Path relative to the knowledge dir, POSIX separators. */
  file: string;
  size: number;
  /** ISO timestamp of the last write. */
  modifiedAt: string;
  status: KnowledgeDocumentStatus;
}

/** GET /v1/knowledge — everything the management page needs at a glance. */
export interface KnowledgeStatus {
  /** Knowledge dir on the server's machine (documents live here). */
  dir: string;
  /** Embedding model the user selected; absent when none is (indexing/search are refused). */
  embeddingModel?: string;
  /** Model that produced the current index; differs after a model change, which needs a rebuild. */
  indexedModel?: string;
  /** False when no model is selected, or the selected one is not downloaded. */
  modelDownloaded: boolean;
  /** Installed local embedding models (`feature-extraction`) the user can pick from. */
  availableEmbeddingModels: string[];
  /** Markdown files on disk. */
  documents: number;
  /** Files recorded in the index manifest. */
  indexed: number;
  /** Chunks in the vector store. */
  chunks: number;
  /** When the index was last written. */
  updatedAt?: string;
  /** True while an index run is in flight. */
  indexing: boolean;
}

/** One imported document: Markdown source plus where it should land. */
export const KnowledgeDocumentInputSchema = z.object({
  /** Knowledge-dir-relative path, e.g. "notes/agent.md". */
  path: z.string().min(1),
  content: z.string(),
});
export type KnowledgeDocumentInput = z.infer<typeof KnowledgeDocumentInputSchema>;

/** POST /v1/knowledge/documents — import documents; existing paths are skipped unless `overwrite`. */
export const KnowledgeImportRequestSchema = z.object({
  documents: z.array(KnowledgeDocumentInputSchema).min(1),
  overwrite: z.boolean().optional(),
});
export type KnowledgeImportRequestInput = z.infer<typeof KnowledgeImportRequestSchema>;

/** What an import did, by document path. */
export interface KnowledgeImportResult {
  written: string[];
  overwritten: string[];
  skipped: string[];
}

/** DELETE /v1/knowledge/documents — remove one document (file + index entries). */
export const KnowledgeDeleteRequestSchema = z.object({
  path: z.string().min(1),
});
export type KnowledgeDeleteRequestInput = z.infer<typeof KnowledgeDeleteRequestSchema>;

/** GET /v1/knowledge/document — one document's Markdown source. */
export const KnowledgeReadQuerySchema = z.object({
  path: z.string().min(1),
});
export type KnowledgeReadQueryInput = z.infer<typeof KnowledgeReadQuerySchema>;

/** POST /v1/knowledge/index — incremental update, or a full rebuild. */
export const KnowledgeIndexRequestSchema = z.object({
  /** Drop the index (and the manifest) and re-embed every file. */
  rebuild: z.boolean().optional(),
});
export type KnowledgeIndexRequestInput = z.infer<typeof KnowledgeIndexRequestSchema>;

/** POST /v1/knowledge/search — retrieval for the page's search box. */
export const KnowledgeSearchRequestSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().max(20).optional(),
});
export type KnowledgeSearchRequestInput = z.infer<typeof KnowledgeSearchRequestSchema>;

/** One frame of the POST /v1/knowledge/index SSE progress stream. */
export interface KnowledgeIndexProgress {
  phase: "embed" | "done";
  /** File being embedded (phase "embed"). */
  file?: string;
  filesDone: number;
  filesTotal: number;
  /** Chunks stored after the run (phase "done"). */
  chunks: number;
}
