// Public surface of @nyx/knowledge (server/CLI only — it pulls in LanceDB + ONNX).
export {
  DEFAULT_EMBEDDING_MODEL,
  createKnowledgeBase,
  getKnowledgeBase,
  KnowledgeBase,
  listKnowledgeBases,
  removeKnowledgeBase,
  resolveEmbeddingModel,
} from "./kb.ts";
export type {
  CreateKnowledgeBaseOptions,
  IndexProgress,
  IndexStats,
  KnowledgeBaseConfig,
} from "./kb.ts";
export type { SearchHit } from "./lance.ts";
export { chunkDocument } from "./chunk.ts";
export type { Chunk } from "./chunk.ts";
