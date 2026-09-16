/**
 * Agent tools the brain may call. Each module builds one group: local coding
 * tools (`agent`), locally installed ONNX models (`model`), knowledge-base
 * search (`knowledge`), web search (`websearch`), and web fetch (`webfetch`).
 */
import type { AgentToolSet } from "@nyx/core";
import { createWebFetchTools } from "./webfetch.ts";
import { createWebSearchTools } from "./websearch.ts";
import type { WebSearchToolsOptions } from "./websearch.ts";

export { createAgentTools } from "./agent.ts";
export { createKnowledgeTools } from "./knowledge.ts";
export { createModelTools } from "./model.ts";
export { createWebFetchTools } from "./webfetch.ts";
export { createWebSearchTools } from "./websearch.ts";
export type { WebSearchProvider, WebSearchToolsOptions } from "./websearch.ts";

/**
 * Both web tools as one group. They share the single `agent.tools.webSearch`
 * toggle, so callers get them together.
 */
export function createWebTools(options: WebSearchToolsOptions = {}): AgentToolSet {
  return [...createWebSearchTools(options), ...createWebFetchTools()];
}
