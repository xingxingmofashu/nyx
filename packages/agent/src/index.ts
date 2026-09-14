// Public surface of @nyx/agent; everything else in the package is internal.

export type {
  ResolvedAgentModel,
  AgentToolApproval,
  AgentToolContext,
  AgentTool,
  AgentToolSet,
  AgentRunOptions,
  UIMessage,
  UIMessageChunk,
} from "./types.ts";

export { resolveModel, resolveModelConfig } from "./providers.ts";
export { streamAgent } from "./agent.ts";
