// Public surface of @nyx/agent. The provider-agnostic loop (`agent.ts`), the
// shared types (`types.ts`), and the `Provider` layer (`provider.ts`) sit at
// the package root. The rest of the root adds the concrete capabilities (tools,
// workspace sandbox, model/knowledge/task services), which pull in @nyx/llm and
// @nyx/knowledge (ONNX, LanceDB); the root is imported by @nyx/server.

export type {
  ResolvedAgentModel,
  AgentRunOptions,
  UIMessage,
  UIMessageChunk,
} from "./types.ts";
export { Provider } from "./provider.ts";
export { streamAgent } from "./agent.ts";
export { ensureModelsCatalog, lookupModelLimit } from "./models-dev.ts";

export { AgentService } from "./services/agent.ts";
export { KnowledgeService } from "./services/knowledge.ts";
export { ModelsService } from "./services/models.ts";
export { AutomaticSpeechRecognitionService } from "./services/tasks/automatic-speech-recognition.ts";
export { ImageToImageService } from "./services/tasks/image-to-image.ts";
export { TextToSpeechService } from "./services/tasks/text-to-speech.ts";

export {
  createAgentTools,
  createKnowledgeTools,
  createModelTools,
  createWebTools,
  toolApproval,
} from "./tools/index.ts";
