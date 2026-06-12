import { describe, expect, it } from "vitest";
import { WorkboardStore, type WorkboardKeyedStore } from "./store.js";

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

describe("WorkboardStore", () => {
  it("creates and lists cards by status order and position", async () => {
    const store = new WorkboardStore(createMemoryStore());

    const review = await store.create({
      title: "Review release notes",
      status: "review",
      priority: "high",
      labels: "release, docs",
    });
    const todo = await store.create({ title: "Fix dashboard copy", status: "todo" });

    expect((await store.list()).map((card) => card.id)).toEqual([todo.id, review.id]);
    expect(review.labels).toEqual(["release", "docs"]);
    expect(review.priority).toBe("high");
    expect(review.events?.[0]).toMatchObject({ kind: "created", toStatus: "review" });
  });

  it("keeps initial session, run, and task links when creating cards", async () => {
    const store = new WorkboardStore(createMemoryStore());

    const card = await store.create({
      title: "Follow up",
      sessionKey: "agent:main:dashboard:1",
      runId: "run-1",
      taskId: "task-1",
    });

    expect(card).toMatchObject({
      sessionKey: "agent:main:dashboard:1",
      runId: "run-1",
      taskId: "task-1",
    });
  });

  it("moves cards and records lifecycle timestamps", async () => {
    const store = new WorkboardStore(createMemoryStore());
    const card = await store.create({ title: "Ship workboard" });

    const running = await store.move(card.id, "running", 500);
    expect(running.status).toBe("running");
    expect(running.position).toBe(500);
    expect(running.startedAt).toBeGreaterThanOrEqual(card.createdAt);
    expect(running.events?.at(-1)).toMatchObject({
      kind: "moved",
      fromStatus: "todo",
      toStatus: "running",
    });

    const done = await store.update(card.id, { status: "done" });
    expect(done.completedAt).toBeGreaterThanOrEqual(done.startedAt ?? 0);
  });

  it("records link and edit events without growing the event log forever", async () => {
    const store = new WorkboardStore(createMemoryStore());
    const card = await store.create({ title: "Trace card" });

    const linked = await store.update(card.id, {
      sessionKey: "agent:main:dashboard:1",
      runId: "run-1",
    });
    expect(linked.events?.at(-1)).toMatchObject({
      kind: "linked",
      sessionKey: "agent:main:dashboard:1",
      runId: "run-1",
    });

    let edited = linked;
    for (let index = 0; index < 60; index += 1) {
      edited = await store.update(card.id, { notes: `note ${index}` });
    }

    expect(edited.events).toHaveLength(50);
    expect(edited.events?.at(-1)).toMatchObject({ kind: "edited" });
    expect(edited.events?.[0]?.kind).toBe("edited");
  });

  it("adds comments, proof, and artifacts as bounded metadata", async () => {
    const store = new WorkboardStore(createMemoryStore());
    const card = await store.create({ title: "Track proof" });

    const commented = await store.addComment(card.id, {
      body: "Reviewer asked for screenshots.",
    });
    expect(commented.metadata?.comments?.[0]).toMatchObject({
      body: "Reviewer asked for screenshots.",
    });
    expect(commented.events?.at(-1)).toMatchObject({ kind: "comment_added" });

    const proven = await store.addProof(card.id, {
      status: "passed",
      command: "pnpm test extensions/workboard",
    });
    expect(proven.metadata?.proof?.[0]).toMatchObject({
      status: "passed",
      command: "pnpm test extensions/workboard",
    });
    expect(proven.events?.at(-1)).toMatchObject({ kind: "proof_added" });

    const artifacted = await store.addArtifact(card.id, {
      label: "Screenshot",
      path: "/tmp/workboard.png",
      mimeType: "image/png",
    });
    expect(artifacted.metadata?.artifacts?.[0]).toMatchObject({
      label: "Screenshot",
      path: "/tmp/workboard.png",
    });
    expect(artifacted.events?.at(-1)).toMatchObject({ kind: "artifact_added" });
  });

  it("caps retained comments and rejects incomplete artifacts atomically", async () => {
    const store = new WorkboardStore(createMemoryStore());
    const card = await store.create({ title: "Retain metadata" });

    let updated = card;
    for (let index = 0; index < 55; index += 1) {
      updated = await store.addComment(card.id, { body: `Note ${index}` });
    }

    expect(updated.metadata?.comments).toHaveLength(50);
    expect(updated.metadata?.comments?.[0]?.body).toBe("Note 5");
    await expect(store.addArtifact(card.id, { label: "missing target" })).rejects.toThrow(
      /artifact url or path/,
    );
    await expect(store.get(card.id)).resolves.not.toMatchObject({
      metadata: { artifacts: [expect.objectContaining({ label: "missing target" })] },
    });
  });

  it("rejects invalid status values", async () => {
    const store = new WorkboardStore(createMemoryStore());
    await expect(store.create({ title: "Bad card", status: "later" })).rejects.toThrow(
      /status must be one of/,
    );
  });
});
