import { describe, expect, it } from "vitest";
import type { OpenClawPluginApi } from "../api.js";
import { WorkboardStore, type WorkboardKeyedStore } from "./store.js";
import { createWorkboardTools } from "./tools.js";

function createMemoryStore(): WorkboardKeyedStore {
  const entries = new Map<string, Awaited<ReturnType<WorkboardKeyedStore["lookup"]>>>();
  return {
    async register(key, value) {
      entries.set(key, value);
    },
    async lookup(key) {
      return entries.get(key);
    },
    async delete(key) {
      return entries.delete(key);
    },
    async entries() {
      return [...entries].flatMap(([key, value]) => (value ? [{ key, value }] : []));
    },
  };
}

function toolByName(tools: ReturnType<typeof createWorkboardTools>, name: string) {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`missing tool: ${name}`);
  }
  return tool;
}

describe("createWorkboardTools", () => {
  it("lists and reads Workboard cards", async () => {
    const store = new WorkboardStore(createMemoryStore());
    const todo = await store.create({ title: "Write docs", status: "todo", agentId: "main" });
    await store.create({ title: "Review tests", status: "review", agentId: "qa" });
    const tools = createWorkboardTools({ api: {} as OpenClawPluginApi, store });

    const list = await toolByName(tools, "workboard_list").execute("call-1", {
      status: "todo",
      agentId: "main",
    });
    expect(list.details).toMatchObject({
      cards: [expect.objectContaining({ id: todo.id, title: "Write docs" })],
    });

    const read = await toolByName(tools, "workboard_read").execute("call-2", { id: todo.id });
    expect(read.details).toMatchObject({
      card: { id: todo.id, title: "Write docs" },
    });
  });

  it("appends comments and proof through tools", async () => {
    const store = new WorkboardStore(createMemoryStore());
    const card = await store.create({ title: "Capture proof" });
    const tools = createWorkboardTools({ api: {} as OpenClawPluginApi, store });

    const comment = await toolByName(tools, "workboard_comment").execute("call-1", {
      id: card.id,
      body: "Waiting on screenshots.",
    });
    expect(comment.details).toMatchObject({
      card: {
        metadata: {
          comments: [expect.objectContaining({ body: "Waiting on screenshots." })],
        },
      },
    });

    const proof = await toolByName(tools, "workboard_proof").execute("call-2", {
      id: card.id,
      status: "passed",
      command: "pnpm test extensions/workboard",
    });
    expect(proof.details).toMatchObject({
      card: {
        metadata: {
          proof: [expect.objectContaining({ status: "passed" })],
        },
      },
    });
  });

  it("claims, heartbeats, and releases cards through tools", async () => {
    const store = new WorkboardStore(createMemoryStore());
    const card = await store.create({ title: "Coordinate me" });
    const tools = createWorkboardTools({ api: {} as OpenClawPluginApi, store });

    const claimed = await toolByName(tools, "workboard_claim").execute("call-1", {
      id: card.id,
      ownerId: "agent-main",
      token: "token-1",
    });
    expect(claimed.details).toMatchObject({
      token: "token-1",
      card: {
        status: "running",
        metadata: { claim: { ownerId: "agent-main" } },
      },
    });

    const heartbeat = await toolByName(tools, "workboard_heartbeat").execute("call-2", {
      id: card.id,
      ownerId: "agent-main",
      note: "still alive",
    });
    expect(heartbeat.details).toMatchObject({
      card: {
        metadata: { comments: [expect.objectContaining({ body: "still alive" })] },
      },
    });

    const released = await toolByName(tools, "workboard_release").execute("call-3", {
      id: card.id,
      ownerId: "agent-main",
      status: "review",
    });
    expect(released.details).toMatchObject({ card: { status: "review" } });
    expect(released.details.card.metadata?.claim).toBeUndefined();
  });

  it("completes and blocks cards through tools", async () => {
    const store = new WorkboardStore(createMemoryStore());
    const doneCard = await store.create({ title: "Finish me" });
    const blockedCard = await store.create({ title: "Block me" });
    const tools = createWorkboardTools({ api: {} as OpenClawPluginApi, store });

    const completed = await toolByName(tools, "workboard_complete").execute("call-1", {
      id: doneCard.id,
      summary: "Shipped.",
      proof: { status: "passed", command: "pnpm test extensions/workboard" },
    });
    expect(completed.details).toMatchObject({
      card: {
        status: "done",
        metadata: {
          comments: [expect.objectContaining({ body: "Shipped." })],
          proof: [expect.objectContaining({ status: "passed" })],
        },
      },
    });

    const blocked = await toolByName(tools, "workboard_block").execute("call-2", {
      id: blockedCard.id,
      reason: "Needs product decision.",
    });
    expect(blocked.details).toMatchObject({
      card: {
        status: "blocked",
        metadata: {
          comments: [expect.objectContaining({ body: "Needs product decision." })],
        },
      },
    });
  });

  it("dispatches dependency-ready cards through tools", async () => {
    const store = new WorkboardStore(createMemoryStore());
    const parent = await store.create({ title: "Parent" });
    const child = await store.create({ title: "Child", status: "backlog" });
    await store.linkCards(parent.id, child.id);
    await store.complete(parent.id);
    const tools = createWorkboardTools({ api: {} as OpenClawPluginApi, store });

    const result = await toolByName(tools, "workboard_dispatch").execute("call-1", {});

    expect(result.details).toMatchObject({
      promoted: [expect.objectContaining({ id: child.id, status: "todo" })],
      count: 1,
    });
  });

  it("reports missing cards from read tools", async () => {
    const store = new WorkboardStore(createMemoryStore());
    const tools = createWorkboardTools({ api: {} as OpenClawPluginApi, store });

    await expect(
      toolByName(tools, "workboard_read").execute("call-1", { id: "missing" }),
    ).rejects.toThrow("card not found: missing");
  });
});
