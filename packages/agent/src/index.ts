// Public surface of @nyx/agent; everything else in the package is internal.

export type {
  AgentProviderId,
  AgentModelConfig,
  AgentToolApproval,
  AgentToolContext,
  AgentTool,
  AgentToolSet,
  AgentRunOptions,
  AgentEvent,
  ModelMessage,
} from "./types.ts";

export { resolveModel } from "./providers.ts";
export { streamAgent } from "./agent.ts";
