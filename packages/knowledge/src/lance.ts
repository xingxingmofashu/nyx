import { mkdir } from "node:fs/promises";
import * as lancedb from "@lancedb/lancedb";

/** One embedded chunk as stored in the LanceDB table. */
export interface ChunkRecord {
  /** Stable key `<file>#<ordinal>`. */
  id: string;
  /** Source file path, relative to the knowledge base root. */
  file: string;
  /** Heading breadcrumb within the file. */
  heading: string;
  ordinal: number;
  text: string;
  /** L2-normalized embedding. */
  vector: Float32Array;
}

export interface SearchHit {
  file: string;
  heading: string;
  text: string;
  /** RRF relevance score (higher is better). */
  score: number;
}

const TABLE = "chunks";

/**
 * LanceDB-backed store for one knowledge base: chunk text + metadata in a Lance
 * table, with a native FTS (trigram-like n-gram) index. Vector + FTS search are
 * fused by LanceDB's RRF reranker. The table is created lazily on first write so
 * the vector dimension comes from the embedding model rather than a constant.
 */
export class KbStore {
  private constructor(
    private readonly db: lancedb.Connection,
    private table: lancedb.Table | null,
  ) {}

  /** Open (or create) the table directory. */
  static async open(dir: string): Promise<KbStore> {
    await mkdir(dir, { recursive: true });
    const db = await lancedb.connect(dir);
    const names = await db.tableNames();
    const table = names.includes(TABLE) ? await db.openTable(TABLE) : null;
    return new KbStore(db, table);
  }

  /** Replace a file's chunks (delete then add) in the table. */
  async replaceFile(file: string, rows: ChunkRecord[]): Promise<void> {
    if (!this.table) {
      if (rows.length > 0) this.table = await this.createTable(rows);
      return;
    }
    await this.table.delete(`file = '${escapeLiteral(file)}'`);
    if (rows.length > 0) await this.table.add(toRecords(rows));
  }

  /** Delete a file's chunks (no-op when the table or file is absent). */
  async deleteFile(file: string): Promise<void> {
    await this.table?.delete(`file = '${escapeLiteral(file)}'`);
  }

  /** Hybrid (vector + keyword) search, fused with reciprocal rank fusion. */
  async search(queryVector: Float32Array, queryText: string, topK = 6): Promise<SearchHit[]> {
    if (!this.table) return [];
    const reranker = await lancedb.rerankers.RRFReranker.create();
    // No `.select(...)`: restricting output columns makes LanceDB emit a
    // deprecation warning about `_score`/`_distance` auto-projection from native
    // code straight to stderr, which corrupts the CLI TUI. Project in JS instead.
    const rows = await this.table
      .query()
      .nearestTo(queryVector)
      .fullTextSearch(queryText)
      .rerank(reranker)
      .limit(topK)
      .toArray();
    return rows.map((row) => ({
      file: String(row.file),
      heading: String(row.heading),
      text: String(row.text),
      score: Number(row._relevance_score ?? 0),
    }));
  }

  /** Number of stored chunks. */
  async countChunks(): Promise<number> {
    if (!this.table) return 0;
    return this.table.countRows();
  }

  async close(): Promise<void> {
    this.table?.close();
    this.db.close();
  }

  private async createTable(rows: ChunkRecord[]): Promise<lancedb.Table> {
    const table = await this.db.createTable(TABLE, toRecords(rows));
    // ngram min length 2 so 2-character CJK queries match; substring-style recall
    // for identifiers, closer to the previous SQLite trigram setup.
    await table.createIndex("text", {
      config: lancedb.Index.fts({ baseTokenizer: "ngram", ngramMinLength: 2 }),
    });
    await table.waitForIndex(["text_idx"], 60);
    return table;
  }
}

/** LanceDB records: vectors must be `number[]`/typed arrays, not undefined. */
function toRecords(rows: ChunkRecord[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    id: row.id,
    file: row.file,
    heading: row.heading,
    ordinal: row.ordinal,
    text: row.text,
    vector: row.vector,
  }));
}

/** Escape a string for a LanceDB SQL filter literal. */
function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
