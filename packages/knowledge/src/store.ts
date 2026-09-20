import * as lancedb from "@lancedb/lancedb"
import fs from "fs-extra"

export interface ChunkRecord {
  id: string
  file: string
  ordinal: number
  text: string
  vector: Float32Array
}

export interface SearchHit {
  file: string
  text: string
  score: number
}

export class Store {
  private static readonly TABLE = "chunks"

  private constructor(
    private readonly db: lancedb.Connection,
    private table: lancedb.Table | null,
  ) {}

  static async open(dir: string): Promise<Store> {
    await fs.ensureDir(dir)
    const db = await lancedb.connect(dir)
    try {
      const names = await db.tableNames()
      const table = names.includes(Store.TABLE) ? await db.openTable(Store.TABLE) : null
      return new Store(db, table)
    } catch (error) {
      db.close()
      throw error
    }
  }

  async replaceFile(file: string, rows: ChunkRecord[]): Promise<void> {
    if (!this.table) {
      if (rows.length > 0) this.table = await this.createTable(rows)
      return
    }
    await this.table.delete(`file = '${Store.escape(file)}'`)
    if (rows.length > 0) await this.table.add(Store.records(rows))
  }

  async deleteFile(file: string): Promise<void> {
    await this.table?.delete(`file = '${Store.escape(file)}'`)
  }

  async search(queryVector: Float32Array, queryText: string, topK = 6): Promise<SearchHit[]> {
    if (!this.table) return []
    try {
      const reranker = await lancedb.rerankers.RRFReranker.create()
      const rows = await this.table
        .query()
        .nearestTo(queryVector)
        .fullTextSearch(queryText)
        .rerank(reranker)
        .limit(topK)
        .toArray()
      return rows.map((row) => ({
        file: String(row.file),
        text: String(row.text),
        score: Number(row._relevance_score ?? 0),
      }))
    } catch {
      const rows = await this.table.query().nearestTo(queryVector).limit(topK).toArray()
      return rows.map((row) => ({
        file: String(row.file),
        text: String(row.text),
        score: Number(row._distance ?? 0),
      }))
    }
  }

  async countChunks(): Promise<number> {
    if (!this.table) return 0
    return this.table.countRows()
  }

  async listFiles(): Promise<string[]> {
    if (!this.table) return []
    const rows = await this.table.query().select(["file"]).toArray()
    return [...new Set(rows.map((row) => String(row.file)))]
  }

  async close(): Promise<void> {
    this.table?.close()
    this.db.close()
  }

  private async createTable(rows: ChunkRecord[]): Promise<lancedb.Table> {
    const table = await this.db.createTable(Store.TABLE, Store.records(rows))
    await table.createIndex("text", {
      config: lancedb.Index.fts({ baseTokenizer: "ngram", ngramMinLength: 2 }),
    })
    await table.waitForIndex(["text_idx"], 60)
    return table
  }

  private static records(rows: ChunkRecord[]): Record<string, unknown>[] {
    return rows.map((row) => ({
      id: row.id,
      file: row.file,
      ordinal: row.ordinal,
      text: row.text,
      vector: row.vector,
    }))
  }

  private static escape(value: string): string {
    return value.replace(/'/g, "''")
  }
}
