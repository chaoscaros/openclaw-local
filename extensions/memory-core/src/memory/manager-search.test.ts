import {
  ensureMemoryIndexSchema,
  requireNodeSqlite,
} from "openclaw/plugin-sdk/memory-core-host-engine-storage";
import { describe, expect, it, vi } from "vitest";
import { bm25RankToScore, buildFtsQuery } from "./hybrid.js";
import { searchKeyword, searchVector } from "./manager-search.js";

describe("searchKeyword trigram fallback", () => {
  const { DatabaseSync } = requireNodeSqlite();

  function createTrigramDb() {
    const db = new DatabaseSync(":memory:");
    ensureMemoryIndexSchema({
      db,
      embeddingCacheTable: "embedding_cache",
      cacheEnabled: false,
      ftsTable: "chunks_fts",
      ftsEnabled: true,
      ftsTokenizer: "trigram",
    });
    return db;
  }

  async function runSearch(params: {
    rows: Array<{ id: string; path: string; text: string }>;
    query: string;
    boostFallbackRanking?: boolean;
  }) {
    const db = createTrigramDb();
    try {
      const insert = db.prepare(
        "INSERT INTO chunks_fts (text, id, path, source, model, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const row of params.rows) {
        insert.run(row.text, row.id, row.path, "memory", "mock-embed", 1, 1);
      }
      return await searchKeyword({
        db,
        ftsTable: "chunks_fts",
        providerModel: "mock-embed",
        query: params.query,
        ftsTokenizer: "trigram",
        limit: 10,
        snippetMaxChars: 200,
        sourceFilter: { sql: "", params: [] },
        buildFtsQuery,
        bm25RankToScore,
        boostFallbackRanking: params.boostFallbackRanking,
      });
    } finally {
      db.close();
    }
  }

  it("finds short Chinese queries with substring fallback", async () => {
    const results = await runSearch({
      rows: [{ id: "1", path: "memory/zh.md", text: "今天玩成语接龙游戏" }],
      query: "成语",
    });
    expect(results.map((row) => row.id)).toContain("1");
    expect(results[0]?.textScore).toBe(1);
  });

  it("finds short Japanese and Korean queries with substring fallback", async () => {
    const japaneseResults = await runSearch({
      rows: [{ id: "jp", path: "memory/jp.md", text: "今日はしりとり大会" }],
      query: "しり とり",
    });
    expect(japaneseResults.map((row) => row.id)).toEqual(["jp"]);

    const koreanResults = await runSearch({
      rows: [{ id: "ko", path: "memory/ko.md", text: "오늘 끝말잇기 게임을 했다" }],
      query: "끝말",
    });
    expect(koreanResults.map((row) => row.id)).toEqual(["ko"]);
  });

  it("keeps MATCH semantics for long trigram terms while requiring short CJK substrings", async () => {
    const results = await runSearch({
      rows: [
        { id: "match", path: "memory/good.md", text: "今天玩成语接龙游戏" },
        { id: "partial", path: "memory/partial.md", text: "今天玩成语接龙" },
      ],
      query: "成语接龙 游戏",
    });
    expect(results.map((row) => row.id)).toEqual(["match"]);
    expect(results[0]?.textScore).toBeGreaterThan(0);
  });

  it("applies fallback lexical boosts without exceeding bounded scores", async () => {
    const results = await runSearch({
      rows: [
        {
          id: "strong",
          path: "memory/project-memory-notes.md",
          text: "Project memory notes covering workspace context and retrieval behavior.",
        },
        {
          id: "weak",
          path: "memory/notes.md",
          text: "Project memory context.",
        },
      ],
      query: "project memory context",
      boostFallbackRanking: true,
    });
    expect(results.map((row) => row.id)).toEqual(["weak", "strong"]);
    const rawResults = await runSearch({
      rows: [
        {
          id: "strong",
          path: "memory/project-memory-notes.md",
          text: "Project memory notes covering workspace context and retrieval behavior.",
        },
        {
          id: "weak",
          path: "memory/notes.md",
          text: "Project memory context.",
        },
      ],
      query: "project memory context",
      boostFallbackRanking: false,
    });

    const boostedById = new Map(results.map((row) => [row.id, row]));
    const rawById = new Map(rawResults.map((row) => [row.id, row]));
    expect(rawById.get("strong")?.textScore).toBeLessThan(rawById.get("weak")?.textScore ?? 0);
    expect(boostedById.get("strong")?.score).toBeGreaterThan(boostedById.get("weak")?.score ?? 0);
    expect(boostedById.get("strong")?.textScore).toBe(rawById.get("strong")?.textScore);
    expect(boostedById.get("weak")?.textScore).toBe(rawById.get("weak")?.textScore);
    expect(boostedById.get("strong")?.score).toBeLessThanOrEqual(1);
    expect(boostedById.get("weak")?.score).toBeLessThanOrEqual(1);
  });

  it("does not overweight repeated query tokens in fallback scoring", async () => {
    const unique = await runSearch({
      rows: [{ id: "1", path: "memory/project.md", text: "Project memory context." }],
      query: "project memory context",
      boostFallbackRanking: true,
    });
    const repeated = await runSearch({
      rows: [{ id: "1", path: "memory/project.md", text: "Project memory context." }],
      query: "project project project memory context",
      boostFallbackRanking: true,
    });

    expect(repeated[0]?.score).toBe(unique[0]?.score);
  });
});

describe("searchVector fallback batching", () => {
  const { DatabaseSync } = requireNodeSqlite();

  function createFallbackDb(): InstanceType<typeof DatabaseSync> {
    const db = new DatabaseSync(":memory:");
    ensureMemoryIndexSchema({
      db,
      embeddingCacheTable: "embedding_cache",
      cacheEnabled: false,
      ftsTable: "chunks_fts",
      ftsEnabled: false,
    });
    return db;
  }

  function insertFallbackChunk(
    db: InstanceType<typeof DatabaseSync>,
    params: { id: string; model: string; vector: number[] },
  ): void {
    db.prepare(
      "INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      params.id,
      `memory/${params.id}.md`,
      "memory",
      1,
      1,
      params.id,
      params.model,
      `chunk ${params.id}`,
      JSON.stringify(params.vector),
      1,
    );
  }

  it("scans fallback rows in bounded rowid batches", async () => {
    type ChunkRow = {
      rowid: number;
      id: string;
      path: string;
      start_line: number;
      end_line: number;
      text: string;
      embedding: string;
      source: string;
    };

    const chunkRows: ChunkRow[] = Array.from({ length: 513 }, (_, index) => {
      const vector: [number, number] = index === 511 ? [1, 0] : index === 512 ? [0.9, 0.1] : [0, 1];
      return {
        rowid: index + 1,
        id: `target-${index}`,
        path: `memory/target-${index}.md`,
        start_line: 1,
        end_line: 1,
        text: `chunk target-${index}`,
        embedding: JSON.stringify(vector),
        source: "memory",
      };
    });
    const batchSizes: number[] = [];
    const prepare = vi.fn((sql: string) => {
      expect(sql).toContain("SELECT rowid, id, path");
      expect(sql).toContain("ORDER BY rowid ASC");
      expect(sql).toContain("LIMIT ?");
      return {
        all: (_model: string, lastRowid: number, limit: number) => {
          const batch = chunkRows.filter((row) => row.rowid > lastRowid).slice(0, limit);
          batchSizes.push(batch.length);
          return batch;
        },
      };
    });

    const results = await searchVector({
      db: { prepare } as unknown as Parameters<typeof searchVector>[0]["db"],
      vectorTable: "chunks_vec",
      providerModel: "target-model",
      queryVec: [1, 0],
      limit: 2,
      snippetMaxChars: 200,
      ensureVectorReady: async () => false,
      sourceFilterVec: { sql: "", params: [] },
      sourceFilterChunks: { sql: "", params: [] },
    });

    expect(results.map((row) => row.id)).toEqual(["target-511", "target-512"]);
    expect(batchSizes).toEqual([256, 256, 1]);
  });

  it("picks up rows inserted during the inter-batch event-loop yield", async () => {
    const db = createFallbackDb();
    try {
      for (let i = 0; i < 257; i += 1) {
        insertFallbackChunk(db, {
          id: `baseline-${i}`,
          model: "target-model",
          vector: [0, 1],
        });
      }

      let inserted = false;
      setImmediate(() => {
        inserted = true;
        insertFallbackChunk(db, { id: "winner-a", model: "target-model", vector: [1, 0] });
        insertFallbackChunk(db, { id: "winner-b", model: "target-model", vector: [0.9, 0.1] });
      });

      const results = await searchVector({
        db,
        vectorTable: "chunks_vec",
        providerModel: "target-model",
        queryVec: [1, 0],
        limit: 2,
        snippetMaxChars: 200,
        ensureVectorReady: async () => false,
        sourceFilterVec: { sql: "", params: [] },
        sourceFilterChunks: { sql: "", params: [] },
      });

      expect(inserted).toBe(true);
      expect(results.map((row) => row.id)).toEqual(["winner-a", "winner-b"]);
    } finally {
      db.close();
    }
  });
});
