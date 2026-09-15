// Public surface of @nyx/knowledge (server only — it pulls in LanceDB + ONNX).
export { DEFAULT_EMBEDDING_MODEL, KnowledgeBase, resolveEmbeddingModel } from "./kb.ts";
export type { IndexProgress, IndexStats, KnowledgeBaseConfig } from "./kb.ts";
export type { SearchHit } from "./lance.ts";
export { chunkDocument } from "./chunk.ts";
export type { Chunk } from "./chunk.ts";
