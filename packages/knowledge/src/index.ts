// Public surface of @nyx/knowledge (server only — it pulls in LanceDB + ONNX).
export { DEFAULT_EMBEDDING_MODEL, KnowledgeBase, resolveEmbeddingModel } from "./knowledge.ts";
export type {
  DocumentImport,
  DocumentStatus,
  ImportResult,
  IndexProgress,
  IndexStats,
  KnowledgeBaseConfig,
  KnowledgeDocument,
} from "./knowledge.ts";
export type { SearchHit } from "./store.ts";
export { chunkDocument } from "./chunk.ts";
export type { Chunk } from "./chunk.ts";
