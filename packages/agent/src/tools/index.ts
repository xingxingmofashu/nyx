/**
 * Tools the agent model may call. Each module builds one tool: the local coding
 * tools (`read`, `write`, `edit`, `bash`, `grep`, `glob`), locally installed
 * ONNX models (`local-image-to-image`, `local-text-to-speech`), knowledge-base
 * search (`search-knowledge`), web search (`websearch`), and web fetch
 * (`webfetch`).
 */
import { type ToolApprovalConfiguration, type ToolSet } from "ai";
import { createBashTool } from "./bash.ts";
import { createEditFileTool } from "./edit.ts";
import { createGlobTool } from "./glob.ts";
import { createGrepTool } from "./grep.ts";
import { createImageToImageTools } from "./local-image-to-image.ts";
import { createTextToSpeechTools } from "./local-text-to-speech.ts";
import { createReadFileTool } from "./read.ts";
import { createWriteFileTool } from "./write.ts";
import { createWebFetchTool } from "./webfetch.ts";
import { createWebSearchTools } from "./websearch.ts";
import type { WebSearchToolsOptions } from "./websearch.ts";
import type { Provider } from "../provider.ts";

export { createBashTool } from "./bash.ts";
export { createEditFileTool } from "./edit.ts";
export { createGlobTool } from "./glob.ts";
export { createGrepTool } from "./grep.ts";
export { createKnowledgeTools } from "./search-knowledge.ts";
export { createImageToImageTools } from "./local-image-to-image.ts";
export type { ImageToImageToolOptions } from "./local-image-to-image.ts";
export { createTextToSpeechTools } from "./local-text-to-speech.ts";
export type { TextToSpeechToolOptions } from "./local-text-to-speech.ts";
export { createReadFileTool } from "./read.ts";
export { createWriteFileTool } from "./write.ts";
export { createWebFetchTool } from "./webfetch.ts";
export { createWebSearchTools } from "./websearch.ts";
export type { WebSearchProvider, WebSearchToolsOptions } from "./websearch.ts";

/**
 * Tools that pause for the user's approval before they run. The AI SDK
 * configures approval on the loop rather than per tool, so the policy lives
 * here, next to the factories whose tool names it lists.
 */
const NEEDS_APPROVAL = new Set([
  "write_file",
  "edit_file",
  "bash",
  "local_image_to_image",
  "local_text_to_speech",
]);

/** The tools above pause for approval; every other tool runs unattended. */
export const toolApproval: ToolApprovalConfiguration<ToolSet, unknown> = ({ toolCall }) =>
  NEEDS_APPROVAL.has(toolCall.toolName) ? "user-approval" : "not-applicable";

/**
 * Every coding tool for one workspace as one group. Each refuses to escape
 * `workspaceDir`; writes and shell commands pause for user approval.
 */
export function createAgentTools(workspaceDir: string): ToolSet {
  return {
    ...createReadFileTool(workspaceDir),
    ...createWriteFileTool(workspaceDir),
    ...createEditFileTool(workspaceDir),
    ...createBashTool(workspaceDir),
    ...createGrepTool(workspaceDir),
    ...createGlobTool(workspaceDir),
  };
}

/** Options for every locally installed ONNX model tool. */
export interface ModelToolsOptions {
  cache: Provider;
  workspaceDir: string;
  sessionId?: string;
  /** Inline the generated audio in the result for clients that play it back. */
  inlineAudio?: boolean;
}

/**
 * Both local-model tools as one group. They share the single
 * `agent.tools.localModels` toggle, so callers get them together, and each only
 * appears when a model of its task is installed.
 */
export function createModelTools(options: ModelToolsOptions): ToolSet {
  return { ...createImageToImageTools(options), ...createTextToSpeechTools(options) };
}

/**
 * Both web tools as one group. They share the single `agent.tools.webSearch`
 * toggle, so callers get them together.
 */
export function createWebTools(options: WebSearchToolsOptions = {}): ToolSet {
  return { ...createWebSearchTools(options), ...createWebFetchTool() };
}
