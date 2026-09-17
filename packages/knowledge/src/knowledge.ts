import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { embed, embedMany } from "ai";
import { getSettings, getKnowledgeDir } from "@nyx/config";
import { createOnnxEmbeddingModel } from "@nyx/llm";
import { chunkDocument } from "./chunk.ts";
import { KnowledgeStore, type SearchHit } from "./store.ts";

/** Only Markdown files are indexed; the walk skips dotted dirs (incl. `.index`). */
const DOCUMENT_EXTENSIONS = [".md", ".markdown"];
const IGNORED_DIRS = new Set(["node_modules", ".git"]);

/** Hidden subdir under the knowledge dir holding the index (and its config). */
const INDEX_DIR = ".index";

/** Persisted index metadata (kept next to the LanceDB table). */
export interface KnowledgeBaseConfig {
  /** Embedding dimension, recorded after the first index run. */
  dim?: number;
  /** Embedding model that produced the current index, recorded after a run. */
  indexedModel?: string;
  updatedAt?: string;
}

export interface IndexProgress {
  phase: "embed" | "done";
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

/** How far one document is from being searchable. */
export type DocumentStatus = "indexed" | "stale" | "new";

/** One Markdown document in the knowledge dir, for the management UI. */
export interface KnowledgeDocument {
  /** Path relative to the knowledge dir, POSIX separators. */
  file: string;
  size: number;
  /** ISO timestamp of the last write. */
  modifiedAt: string;
  status: DocumentStatus;
}

/** One document to import; `path` is where it should land under the knowledge dir. */
export interface DocumentImport {
  path: string;
  content: string;
}

/** What one import did, by document path. */
export interface ImportResult {
  written: string[];
  overwritten: string[];
  skipped: string[];
}

/**
 * Embedding model the user selected, or undefined when none is configured.
 * There is deliberately no built-in fallback: with nothing selected the
 * knowledge base stays idle instead of embedding with a model of our choosing.
 */
export function resolveEmbeddingModel(): string | undefined {
  return getSettings().knowledge?.embeddingModel;
}

/** Selected embedding model, refusing to embed when the user picked none. */
function requireEmbeddingModel(): string {
  const model = resolveEmbeddingModel();
  if (!model) throw new Error("No embedding model is selected.");
  return model;
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
    const raw = JSON.parse(readFileSync(configPath(), "utf8")) as Partial<KnowledgeBaseConfig>;
    return {
      ...(raw?.dim !== undefined ? { dim: raw.dim } : {}),
      ...(raw?.indexedModel !== undefined ? { indexedModel: raw.indexedModel } : {}),
      ...(raw?.updatedAt !== undefined ? { updatedAt: raw.updatedAt } : {}),
    };
  } catch {
    return {};
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
 * The single local knowledge base: every Markdown file under `getKnowledgeDir()`
 * (default `~/.nyx/knowledge`, override `NYX_KNOWLEDGE_DIR`). The index lives in
 * the hidden `<knowledge>/.index/` subdir, so the document walk never sees it.
 */
export class KnowledgeBase {
  private constructor(public config: KnowledgeBaseConfig) {}

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
    const model = requireEmbeddingModel();
    const store = await KnowledgeStore.open(lanceDir());
    try {
      const sourceDir = getKnowledgeDir();
      const files = walkDocuments(sourceDir);
      const previous = readManifest();
      // Reusing hashes is only safe when the index came from the same model.
      const modelMatches = this.config.indexedModel === model;
      const manifest: Manifest = modelMatches ? previous : {};
      if (!modelMatches) {
        // Switching models re-embeds everything below; forget the old
        // dimension too, so the check further down can't fire against a
        // different model's vectors.
        for (const file of Object.keys(previous)) await store.deleteFile(file);
        this.config.dim = undefined;
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
          model: createOnnxEmbeddingModel({ model, type: "passage" }),
          values: parts.map((part) => part.text),
          ...(options.signal ? { abortSignal: options.signal } : {}),
        });
        if (embeddings.length !== parts.length) {
          throw new Error(`Embedding count mismatch for ${file}`);
        }
        const fileDim = embeddings[0]!.length;
        if (this.config.dim !== undefined && this.config.dim !== fileDim) {
          throw new Error(
            `Embedding dimension changed (${this.config.dim} → ${fileDim}); rebuild the index to embed every document again.`,
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

      // Drop files that disappeared from the knowledge directory. The store and
      // the manifest are both consulted: an interrupted run can leave chunks
      // behind that the manifest never recorded.
      const stale = new Set([...Object.keys(manifest), ...(await store.listFiles())]);
      for (const file of stale) {
        if (seen.has(file)) continue;
        await store.deleteFile(file);
        delete manifest[file];
      }

      const chunks = await store.countChunks();
      if (dim !== undefined) this.config.dim = dim;
      this.config.indexedModel = model;
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
    const model = requireEmbeddingModel();
    // Query vectors must come from the model that built the index, or the
    // distances are meaningless; the caller rebuilds to switch models.
    const indexed = this.config.indexedModel;
    if (indexed !== undefined && indexed !== model) {
      throw new Error(`The index was built with "${indexed}", but "${model}" is selected; rebuild the index first.`);
    }
    const store = await KnowledgeStore.open(lanceDir());
    try {
      const { embedding } = await embed({
        model: createOnnxEmbeddingModel({ model, type: "query" }),
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

  /** Number of chunks in the vector store (0 when there is no index yet). */
  async countChunks(): Promise<number> {
    const store = await KnowledgeStore.open(lanceDir());
    try {
      return await store.countChunks();
    } finally {
      await store.close();
    }
  }

  /**
   * Every document on disk with its index status: `indexed` when its content
   * still hashes to the manifest entry, `stale` when it changed since, `new`
   * when it was never indexed.
   */
  listDocuments(): KnowledgeDocument[] {
    const sourceDir = getKnowledgeDir();
    const manifest = readManifest();
    return walkDocuments(sourceDir)
      .map((absolute) => {
        const file = toPosix(relative(sourceDir, absolute));
        const content = readFileSync(absolute, "utf8");
        const stat = statSync(absolute);
        const hash = manifest[file];
        return {
          file,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          status: hash === undefined ? "new" : hash === hashContent(content) ? "indexed" : "stale",
        } satisfies KnowledgeDocument;
      })
      .sort((a, b) => a.file.localeCompare(b.file));
  }

  /** One document's Markdown source. */
  readDocument(file: string): string {
    return readFileSync(documentPath(file), "utf8");
  }

  /**
   * Write imported documents into the knowledge dir. An existing path is only
   * replaced when `overwrite` is set; otherwise it is reported in `skipped`.
   * Callers own the decision (the desktop asks the user).
   */
  async writeDocuments(entries: DocumentImport[], options: { overwrite?: boolean } = {}): Promise<ImportResult> {
    const result: ImportResult = { written: [], overwritten: [], skipped: [] };
    for (const entry of entries) {
      const file = toPosix(entry.path);
      const absolute = documentPath(file);
      const existed = existsSync(absolute);
      if (existed && options.overwrite !== true) {
        result.skipped.push(file);
        continue;
      }
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, entry.content, "utf8");
      (existed ? result.overwritten : result.written).push(file);
    }
    return result;
  }

  /** Delete a document from disk, the index and the manifest. */
  async deleteDocument(file: string): Promise<void> {
    const path = toPosix(file);
    rmSync(documentPath(path), { force: true });
    const store = await KnowledgeStore.open(lanceDir());
    try {
      await store.deleteFile(path);
    } finally {
      await store.close();
    }
    const manifest = readManifest();
    delete manifest[path];
    writeManifest(manifest);
  }

  /**
   * Throw the index away and build it again from scratch — the recovery path
   * for a changed embedding model (or dimension) as well as a way to force a
   * full re-embed. In-memory config is reset so the new run is not compared
   * against the old model's dimension.
   */
  async rebuild(options: { onProgress?: (progress: IndexProgress) => void; signal?: AbortSignal } = {}): Promise<IndexStats> {
    rmSync(indexDir(), { recursive: true, force: true });
    this.config = {};
    return await this.index(options);
  }
}

/**
 * Resolve a caller-supplied document path against the knowledge dir, refusing
 * anything that is not a plain Markdown path inside it (escapes, hidden segments
 * such as `.index`, absolute paths).
 */
function documentPath(file: string): string {
  const normalized = toPosix(file).replace(/^\/+/, "");
  const segments = normalized.split("/");
  const valid =
    isDocumentFile(normalized) &&
    segments.every((segment) => segment !== "" && segment !== ".." && !segment.startsWith("."));
  if (!valid) throw new Error(`Invalid document path: ${file}`);
  const absolute = resolve(getKnowledgeDir(), normalized);
  const root = resolve(getKnowledgeDir());
  if (absolute !== join(root, ...segments)) throw new Error(`Invalid document path: ${file}`);
  return absolute;
}

/** True for a path the knowledge base accepts: Markdown, by extension. */
function isDocumentFile(path: string): boolean {
  const lower = path.toLowerCase();
  return DOCUMENT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Recursively collect Markdown files under `dir` (tolerates a missing dir). */
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
      else if (entry.isFile() && isDocumentFile(entry.name)) files.push(full);
    }
  };
  walk(dir);
  return files;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}
