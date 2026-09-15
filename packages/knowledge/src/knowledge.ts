import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { embed, embedMany } from "ai";
import { getSettings, getKnowledgeDir } from "@nyx/config";
import { createOnnxEmbeddingModel } from "@nyx/llm";
import { chunkDocument } from "./chunk.ts";
import { KnowledgeStore, type SearchHit } from "./store.ts";

/** Default local embedding model (multilingual, 768d). */
export const DEFAULT_EMBEDDING_MODEL = "Xenova/multilingual-e5-base";

/** Only Markdown files are indexed; the walk skips dotted dirs (incl. `.index`). */
const DOCUMENT_EXTENSION = ".md";
const IGNORED_DIRS = new Set(["node_modules", ".git"]);

/** Hidden subdir under the knowledge dir holding the index (and its config). */
const INDEX_DIR = ".index";

/** Persisted index metadata (kept next to the LanceDB table). */
export interface KnowledgeBaseConfig {
  embeddingModel: string;
  /** Embedding dimension, recorded after the first index run. */
  dim?: number;
  /** Model that produced the current index; a mismatch triggers a full re-index. */
  indexedModel?: string;
  updatedAt?: string;
}

export interface IndexProgress {
  phase: "scan" | "embed" | "done";
  file?: string;
  filesDone: number;
  filesTotal: number;
  chunks: number;
}

export interface IndexStats {
  files: number;
  chunks: number;
  skipped: number;
}

/** Embedding model to use, honoring `settings.knowledge.embeddingModel`. */
export function resolveEmbeddingModel(): string {
  return getSettings().knowledge?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
}

function indexDir(): string {
  return join(getKnowledgeDir(), INDEX_DIR);
}

function configPath(): string {
  return join(indexDir(), "config.json");
}

function manifestPath(): string {
  return join(indexDir(), "manifest.json");
}

function lanceDir(): string {
  return join(indexDir(), "lancedb");
}

function readConfig(): KnowledgeBaseConfig {
  try {
    const raw = JSON.parse(readFileSync(configPath(), "utf8")) as KnowledgeBaseConfig;
    return {
      embeddingModel: raw?.embeddingModel ?? resolveEmbeddingModel(),
      ...(raw?.dim !== undefined ? { dim: raw.dim } : {}),
      ...(raw?.indexedModel !== undefined ? { indexedModel: raw.indexedModel } : {}),
    };
  } catch {
    return { embeddingModel: resolveEmbeddingModel() };
  }
}

function writeConfig(config: KnowledgeBaseConfig): void {
  config.updatedAt = new Date().toISOString();
  mkdirSync(indexDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

/** File path → content hash, used to skip unchanged files on re-index. */
type Manifest = Record<string, string>;

function readManifest(): Manifest {
  try {
    return JSON.parse(readFileSync(manifestPath(), "utf8")) as Manifest;
  } catch {
    return {};
  }
}

function writeManifest(manifest: Manifest): void {
  mkdirSync(indexDir(), { recursive: true });
  writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2));
}

/**
 * The single local knowledge base: every `.md` file under `getKnowledgeDir()`
 * (default `~/.nyx/knowledge`, override `NYX_KNOWLEDGE_DIR`). The index lives in
 * the hidden `<knowledge>/.index/` subdir, so the document walk never sees it.
 */
export class KnowledgeBase {
  private constructor(readonly config: KnowledgeBaseConfig) {}

  static open(): KnowledgeBase {
    return new KnowledgeBase(readConfig());
  }

  /** True when the knowledge dir contains at least one Markdown file. */
  hasDocuments(): boolean {
    return walkDocuments(getKnowledgeDir()).length > 0;
  }

  /** Walk the knowledge dir, (re-)embedding changed files; removed files are pruned. */
  async index(
    options: { onProgress?: (progress: IndexProgress) => void; signal?: AbortSignal } = {},
  ): Promise<IndexStats> {
    const store = await KnowledgeStore.open(lanceDir());
    try {
      const sourceDir = getKnowledgeDir();
      const files = walkDocuments(sourceDir);
      const previous = readManifest();
      // Reusing hashes is only safe when the index came from the same model.
      const modelMatches = this.config.indexedModel === this.config.embeddingModel;
      const manifest: Manifest = modelMatches ? previous : {};
      if (!modelMatches) {
        for (const file of Object.keys(previous)) await store.deleteFile(file);
      }
      const report = (progress: IndexProgress) => options.onProgress?.(progress);
      const seen = new Set<string>();
      let filesDone = 0;
      let skipped = 0;
      let dim: number | undefined;

      for (const absolute of files) {
        options.signal?.throwIfAborted();
        const file = toPosix(relative(sourceDir, absolute));
        seen.add(file);
        const content = await readFile(absolute, "utf8");
        const hash = hashContent(content);
        report({ phase: "embed", file, filesDone, filesTotal: files.length, chunks: 0 });

        if (manifest[file] === hash) {
          skipped++;
          filesDone++;
          continue;
        }

        const parts = chunkDocument(content);
        if (parts.length === 0) {
          await store.deleteFile(file);
          delete manifest[file];
          filesDone++;
          continue;
        }

        const { embeddings } = await embedMany({
          model: createOnnxEmbeddingModel({
            model: this.config.embeddingModel,
            type: "passage",
          }),
          values: parts.map((part) => part.text),
          ...(options.signal ? { abortSignal: options.signal } : {}),
        });
        if (embeddings.length !== parts.length) {
          throw new Error(`Embedding count mismatch for ${file}`);
        }
        const fileDim = embeddings[0]!.length;
        if (this.config.dim !== undefined && this.config.dim !== fileDim) {
          throw new Error(
            `Embedding dimension changed (${this.config.dim} → ${fileDim}); remove the index and re-index after switching models.`,
          );
        }
        dim = fileDim;

        await store.replaceFile(
          file,
          parts.map((part, index) => ({
            id: `${file}#${part.ordinal}`,
            file,
            heading: part.heading,
            ordinal: part.ordinal,
            text: part.text,
            vector: Float32Array.from(embeddings[index]!),
          })),
        );
        manifest[file] = hash;
        filesDone++;
      }

      // Drop files that disappeared from the knowledge directory.
      for (const file of Object.keys(manifest)) {
        if (!seen.has(file)) {
          await store.deleteFile(file);
          delete manifest[file];
        }
      }

      const chunks = await store.countChunks();
      if (dim !== undefined) this.config.dim = dim;
      this.config.indexedModel = this.config.embeddingModel;
      writeManifest(manifest);
      writeConfig(this.config);
      report({ phase: "done", filesDone, filesTotal: files.length, chunks });
      return { files: files.length, chunks, skipped };
    } finally {
      await store.close();
    }
  }

  /** Hybrid (vector + keyword) search over the index. */
  async search(query: string, options: { topK?: number } = {}): Promise<SearchHit[]> {
    const store = await KnowledgeStore.open(lanceDir());
    try {
      const { embedding } = await embed({
        model: createOnnxEmbeddingModel({ model: this.config.embeddingModel, type: "query" }),
        value: query,
      });
      return await store.search(Float32Array.from(embedding), query, options.topK ?? 6);
    } finally {
      await store.close();
    }
  }

  /** Number of indexed files (from the manifest). */
  fileCount(): number {
    return Object.keys(readManifest()).length;
  }
}

/** Recursively collect `.md` files under `dir` (tolerates a missing dir). */
function walkDocuments(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && extname(entry.name) === DOCUMENT_EXTENSION) files.push(full);
    }
  };
  walk(dir);
  return files;
}

function extname(name: string): string {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}
