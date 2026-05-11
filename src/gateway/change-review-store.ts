import fs from "node:fs/promises";
import path from "node:path";

export type ChangeReviewChangeType = "added" | "modified" | "deleted";

export type ChangeReviewFileRecord = {
  path: string;
  absolutePath: string;
  changeType: ChangeReviewChangeType;
  beforeContent: string | null;
  afterContent: string | null;
  diffText: string;
};

export type ChangeReviewBundle = {
  reviewId: string;
  sessionKey: string;
  runId: string;
  workspaceDir: string;
  repoRoot: string;
  stagedOnly?: boolean;
  status: "pending" | "applied" | "reverted" | "stale" | "failed";
  createdAt: number;
  updatedAt: number;
  files: ChangeReviewFileRecord[];
};

type ToolMutationSnapshot = {
  sessionKey: string;
  runId: string;
  toolCallId: string;
  workspaceDir: string;
  repoRoot: string;
  files: Array<{
    relativePath: string;
    absolutePath: string;
    beforeContent: string | null;
  }>;
};

const toolMutationSnapshots = new Map<string, ToolMutationSnapshot>();
const bundlesByReviewId = new Map<string, ChangeReviewBundle>();
const latestPendingReviewIdBySessionKey = new Map<string, string>();
const runToReviewId = new Map<string, string>();
let nextReviewId = 1;

function buildToolMutationKey(runId: string, toolCallId: string): string {
  return `${runId}:${toolCallId}`;
}

function buildRunKey(sessionKey: string, runId: string): string {
  return `${sessionKey}:${runId}`;
}

async function readFileMaybe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function normalizeRelativePath(repoRoot: string, absolutePath: string): string {
  const relative = path.relative(repoRoot, absolutePath);
  return relative.split(path.sep).join("/");
}

function buildSimpleDiff(
  filePath: string,
  beforeContent: string | null,
  afterContent: string | null,
): string {
  if (beforeContent === afterContent) {
    return "";
  }
  const beforeLines = beforeContent == null ? [] : beforeContent.replace(/\n$/, "").split("\n");
  const afterLines = afterContent == null ? [] : afterContent.replace(/\n$/, "").split("\n");
  let prefixCount = 0;
  while (
    prefixCount < beforeLines.length &&
    prefixCount < afterLines.length &&
    beforeLines[prefixCount] === afterLines[prefixCount]
  ) {
    prefixCount += 1;
  }
  let suffixCount = 0;
  while (
    suffixCount < beforeLines.length - prefixCount &&
    suffixCount < afterLines.length - prefixCount &&
    beforeLines[beforeLines.length - 1 - suffixCount] ===
      afterLines[afterLines.length - 1 - suffixCount]
  ) {
    suffixCount += 1;
  }
  const beforeChangedLines = beforeLines.slice(prefixCount, beforeLines.length - suffixCount);
  const afterChangedLines = afterLines.slice(prefixCount, afterLines.length - suffixCount);
  const beforeCount = beforeChangedLines.length;
  const afterCount = afterChangedLines.length;
  const beforeStart = prefixCount + 1;
  const afterStart = prefixCount + 1;
  const header = [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${beforeStart},${beforeCount} +${afterStart},${afterCount} @@`,
  ];
  const removed = beforeChangedLines.map((line) => `-${line}`);
  const added = afterChangedLines.map((line) => `+${line}`);
  return [...header, ...removed, ...added].join("\n");
}

function mergeFileRecord(
  existing: ChangeReviewFileRecord | undefined,
  next: ChangeReviewFileRecord,
): ChangeReviewFileRecord {
  if (!existing) {
    return next;
  }
  const beforeContent = existing.beforeContent;
  const afterContent = next.afterContent;
  const changeType: ChangeReviewChangeType =
    beforeContent == null && afterContent != null
      ? "added"
      : beforeContent != null && afterContent == null
        ? "deleted"
        : "modified";
  return {
    ...existing,
    changeType,
    afterContent,
    diffText: buildSimpleDiff(existing.path, beforeContent, afterContent),
  };
}

function ensureBundle(
  sessionKey: string,
  runId: string,
  workspaceDir: string,
  repoRoot: string,
): ChangeReviewBundle {
  const runKey = buildRunKey(sessionKey, runId);
  const existingId = runToReviewId.get(runKey);
  if (existingId) {
    const existing = bundlesByReviewId.get(existingId);
    if (existing) {
      return existing;
    }
  }
  const bundle: ChangeReviewBundle = {
    reviewId: `review-${nextReviewId++}`,
    sessionKey,
    runId,
    workspaceDir,
    repoRoot,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    files: [],
  };
  bundlesByReviewId.set(bundle.reviewId, bundle);
  runToReviewId.set(runKey, bundle.reviewId);
  return bundle;
}

function activatePendingBundle(bundle: ChangeReviewBundle) {
  const previousPendingId = latestPendingReviewIdBySessionKey.get(bundle.sessionKey);
  if (previousPendingId && previousPendingId !== bundle.reviewId) {
    const previous = bundlesByReviewId.get(previousPendingId);
    if (previous?.status === "pending") {
      previous.status = "stale";
      previous.updatedAt = Date.now();
    }
  }
  latestPendingReviewIdBySessionKey.set(bundle.sessionKey, bundle.reviewId);
}

function finalizeBundleAfterPartialAction(
  bundle: ChangeReviewBundle,
  reviewId: string,
  nextStatus: "applied" | "reverted",
) {
  bundle.updatedAt = Date.now();
  if (bundle.files.length > 0) {
    bundle.status = "pending";
    latestPendingReviewIdBySessionKey.set(bundle.sessionKey, reviewId);
    return bundle;
  }
  bundle.status = nextStatus;
  if (latestPendingReviewIdBySessionKey.get(bundle.sessionKey) === reviewId) {
    latestPendingReviewIdBySessionKey.delete(bundle.sessionKey);
  }
  return bundle;
}

function resolveBundleFileOrThrow(
  bundle: ChangeReviewBundle,
  filePath: string,
): ChangeReviewFileRecord {
  const normalized = filePath.trim();
  const file = bundle.files.find((entry) => entry.path === normalized);
  if (!file) {
    throw new Error(`file not found in review bundle: ${normalized}`);
  }
  return file;
}

export async function beginToolMutationCapture(params: {
  sessionKey: string;
  runId: string;
  toolCallId: string;
  workspaceDir: string;
  repoRoot: string;
  filePaths: string[];
}) {
  if (!params.filePaths.length) {
    return;
  }
  const files: ToolMutationSnapshot["files"] = [];
  for (const filePath of params.filePaths) {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(params.workspaceDir, filePath);
    const normalizedPath = normalizeRelativePath(params.repoRoot, absolutePath);
    if (!normalizedPath || normalizedPath.startsWith("../")) {
      continue;
    }
    files.push({
      relativePath: normalizedPath,
      absolutePath,
      beforeContent: await readFileMaybe(absolutePath),
    });
  }
  if (!files.length) {
    return;
  }
  toolMutationSnapshots.set(buildToolMutationKey(params.runId, params.toolCallId), {
    sessionKey: params.sessionKey,
    runId: params.runId,
    toolCallId: params.toolCallId,
    workspaceDir: params.workspaceDir,
    repoRoot: params.repoRoot,
    files,
  });
}

export async function finishToolMutationCapture(params: {
  sessionKey: string;
  runId: string;
  toolCallId: string;
  fileStatuses?: Array<{ path: string; changeType?: ChangeReviewChangeType }>;
}) {
  const key = buildToolMutationKey(params.runId, params.toolCallId);
  const snapshot = toolMutationSnapshots.get(key);
  toolMutationSnapshots.delete(key);
  if (!snapshot) {
    return null;
  }
  const statusByPath = new Map<string, ChangeReviewChangeType>();
  for (const entry of params.fileStatuses ?? []) {
    statusByPath.set(entry.path, entry.changeType ?? "modified");
  }
  const changedRecords: ChangeReviewFileRecord[] = [];
  for (const file of snapshot.files) {
    const afterContent = await readFileMaybe(file.absolutePath);
    if (file.beforeContent === afterContent) {
      continue;
    }
    const changeType =
      statusByPath.get(file.relativePath) ??
      (file.beforeContent == null && afterContent != null
        ? "added"
        : file.beforeContent != null && afterContent == null
          ? "deleted"
          : "modified");
    changedRecords.push({
      path: file.relativePath,
      absolutePath: file.absolutePath,
      changeType,
      beforeContent: file.beforeContent,
      afterContent,
      diffText: buildSimpleDiff(file.relativePath, file.beforeContent, afterContent),
    });
  }
  if (changedRecords.length === 0) {
    return null;
  }
  const bundle = ensureBundle(
    snapshot.sessionKey,
    snapshot.runId,
    snapshot.workspaceDir,
    snapshot.repoRoot,
  );
  bundle.stagedOnly = false;
  for (const nextRecord of changedRecords) {
    const existingIndex = bundle.files.findIndex((entry) => entry.path === nextRecord.path);
    if (existingIndex >= 0) {
      bundle.files[existingIndex] = mergeFileRecord(bundle.files[existingIndex], nextRecord);
    } else {
      bundle.files.push(nextRecord);
    }
  }
  bundle.updatedAt = Date.now();
  activatePendingBundle(bundle);
  return bundle;
}

export function createVirtualReviewBundle(params: {
  sessionKey: string;
  runId: string;
  workspaceDir: string;
  repoRoot: string;
  files: ChangeReviewFileRecord[];
}) {
  if (!params.files.length) {
    return null;
  }
  const bundle = ensureBundle(
    params.sessionKey,
    params.runId,
    params.workspaceDir,
    params.repoRoot,
  );
  bundle.stagedOnly = true;
  bundle.files = params.files.map((file) => ({ ...file }));
  bundle.updatedAt = Date.now();
  activatePendingBundle(bundle);
  return bundle;
}

export function discardToolMutationCapture(runId: string, toolCallId: string) {
  toolMutationSnapshots.delete(buildToolMutationKey(runId, toolCallId));
}

export function getPendingReviewBySession(sessionKey: string): ChangeReviewBundle | null {
  const reviewId = latestPendingReviewIdBySessionKey.get(sessionKey);
  if (!reviewId) {
    return null;
  }
  const bundle = bundlesByReviewId.get(reviewId) ?? null;
  return bundle?.status === "pending" ? bundle : null;
}

export function getPendingReviewBySessionAndRun(
  sessionKey: string,
  runId?: string | null,
): ChangeReviewBundle | null {
  if (runId) {
    const reviewId = runToReviewId.get(buildRunKey(sessionKey, runId));
    if (!reviewId) {
      return null;
    }
    const bundle = bundlesByReviewId.get(reviewId) ?? null;
    return bundle?.status === "pending" ? bundle : null;
  }
  return getPendingReviewBySession(sessionKey);
}

export function getReviewById(reviewId: string): ChangeReviewBundle | null {
  return bundlesByReviewId.get(reviewId) ?? null;
}

export function markReviewApplied(reviewId: string): ChangeReviewBundle | null {
  const bundle = bundlesByReviewId.get(reviewId) ?? null;
  if (!bundle) {
    return null;
  }
  bundle.status = "applied";
  bundle.updatedAt = Date.now();
  if (latestPendingReviewIdBySessionKey.get(bundle.sessionKey) === reviewId) {
    latestPendingReviewIdBySessionKey.delete(bundle.sessionKey);
  }
  return bundle;
}

export async function applyReviewBundle(reviewId: string): Promise<ChangeReviewBundle | null> {
  const bundle = bundlesByReviewId.get(reviewId) ?? null;
  if (!bundle) {
    return null;
  }
  if (bundle.stagedOnly) {
    for (const file of bundle.files) {
      if (file.afterContent == null) {
        await fs.rm(file.absolutePath, { force: true });
        continue;
      }
      await ensureParentDir(file.absolutePath);
      await fs.writeFile(file.absolutePath, file.afterContent, "utf-8");
    }
  }
  return markReviewApplied(reviewId);
}

export async function revertReviewBundle(reviewId: string): Promise<ChangeReviewBundle | null> {
  const bundle = bundlesByReviewId.get(reviewId) ?? null;
  if (!bundle) {
    return null;
  }
  if (bundle.stagedOnly) {
    bundle.status = "reverted";
    bundle.updatedAt = Date.now();
    if (latestPendingReviewIdBySessionKey.get(bundle.sessionKey) === reviewId) {
      latestPendingReviewIdBySessionKey.delete(bundle.sessionKey);
    }
    return bundle;
  }
  for (const file of bundle.files) {
    const currentContent = await readFileMaybe(file.absolutePath);
    if (currentContent !== file.afterContent) {
      throw new Error(`file changed after review capture: ${file.path}`);
    }
  }
  for (const file of bundle.files) {
    if (file.beforeContent == null) {
      await fs.rm(file.absolutePath, { force: true });
      continue;
    }
    await ensureParentDir(file.absolutePath);
    await fs.writeFile(file.absolutePath, file.beforeContent, "utf-8");
  }
  bundle.status = "reverted";
  bundle.updatedAt = Date.now();
  if (latestPendingReviewIdBySessionKey.get(bundle.sessionKey) === reviewId) {
    latestPendingReviewIdBySessionKey.delete(bundle.sessionKey);
  }
  return bundle;
}

export async function applyReviewBundleFile(
  reviewId: string,
  filePath: string,
): Promise<ChangeReviewBundle | null> {
  const bundle = bundlesByReviewId.get(reviewId) ?? null;
  if (!bundle) {
    return null;
  }
  const file = resolveBundleFileOrThrow(bundle, filePath);
  if (bundle.stagedOnly) {
    if (file.afterContent == null) {
      await fs.rm(file.absolutePath, { force: true });
    } else {
      await ensureParentDir(file.absolutePath);
      await fs.writeFile(file.absolutePath, file.afterContent, "utf-8");
    }
  }
  bundle.files = bundle.files.filter((entry) => entry.path !== file.path);
  return finalizeBundleAfterPartialAction(bundle, reviewId, "applied");
}

export async function revertReviewBundleFile(
  reviewId: string,
  filePath: string,
): Promise<ChangeReviewBundle | null> {
  const bundle = bundlesByReviewId.get(reviewId) ?? null;
  if (!bundle) {
    return null;
  }
  const file = resolveBundleFileOrThrow(bundle, filePath);
  if (!bundle.stagedOnly) {
    const currentContent = await readFileMaybe(file.absolutePath);
    if (currentContent !== file.afterContent) {
      throw new Error(`file changed after review capture: ${file.path}`);
    }
    if (file.beforeContent == null) {
      await fs.rm(file.absolutePath, { force: true });
    } else {
      await ensureParentDir(file.absolutePath);
      await fs.writeFile(file.absolutePath, file.beforeContent, "utf-8");
    }
  }
  bundle.files = bundle.files.filter((entry) => entry.path !== file.path);
  return finalizeBundleAfterPartialAction(bundle, reviewId, "reverted");
}

export function serializeReviewBundle(bundle: ChangeReviewBundle | null) {
  if (!bundle) {
    return { pending: false };
  }
  return {
    pending: bundle.status === "pending",
    id: bundle.reviewId,
    sessionKey: bundle.sessionKey,
    sourceRunId: bundle.runId,
    stagedOnly: bundle.stagedOnly === true,
    createdAt: bundle.createdAt,
    updatedAt: bundle.updatedAt,
    files: bundle.files.map((file) => ({
      path: file.path,
      status: file.changeType,
      changeType: file.changeType,
      beforeContent: file.beforeContent,
      afterContent: file.afterContent,
    })),
    diffText: bundle.files
      .map((file) => file.diffText)
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function resetChangeReviewStoreForTest() {
  toolMutationSnapshots.clear();
  bundlesByReviewId.clear();
  latestPendingReviewIdBySessionKey.clear();
  runToReviewId.clear();
  nextReviewId = 1;
}
