/**
 * Agent tools the brain may call. Each module builds one group: local coding
 * tools (`agent`), locally installed ONNX models (`model`), knowledge-base
 * search (`knowledge`), web search (`websearch`), and web fetch (`webfetch`).
 */
import { type ToolApprovalConfiguration, type ToolSet } from "ai";
import { WebFetchTool } from "./webfetch.ts";
import { createWebSearchTools } from "./websearch.ts";
import type { WebSearchToolsOptions } from "./websearch.ts";

export { createAgentTools } from "./agent.ts";
export { createKnowledgeTools } from "./knowledge.ts";
export { createModelTools } from "./model.ts";
export { WebFetchTool } from "./webfetch.ts";
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
 * Both web tools as one group. They share the single `agent.tools.webSearch`
 * toggle, so callers get them together.
 */
export function createWebTools(options: WebSearchToolsOptions = {}): ToolSet {
  return { ...createWebSearchTools(options), ...WebFetchTool };
}
