import fs from "node:fs/promises";
import path from "node:path";

export type ChangeReviewChangeType = "added" | "modified" | "deleted";

export type ChangeReviewHunkRecord = {
  hunkId: string;
  changeType: ChangeReviewChangeType;
  beforeStartLine: number;
  beforeEndLine: number;
  afterStartLine: number;
  afterEndLine: number;
  beforeLines: string[];
  afterLines: string[];
};

export type ChangeReviewGroupRecord = {
  groupId: string;
  title: string;
  summary: string;
  changeType: ChangeReviewChangeType | "mixed";
  filePath: string;
  hunkIds: string[];
  beforeStartLine: number;
  beforeEndLine: number;
  afterStartLine: number;
  afterEndLine: number;
  beforePreview: string[];
  afterPreview: string[];
  hunkCount: number;
};

export type ChangeReviewFileRecord = {
  path: string;
  absolutePath: string;
  changeType: ChangeReviewChangeType;
  beforeContent: string | null;
  afterContent: string | null;
  diffText: string;
  hunks: ChangeReviewHunkRecord[];
  groups: ChangeReviewGroupRecord[];
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

function normalizeDisplayPath(
  originalPath: string,
  absolutePath: string,
  repoRoot: string,
): string {
  const relativeToRepoRoot = normalizeRelativePath(repoRoot, absolutePath);
  if (relativeToRepoRoot && !relativeToRepoRoot.startsWith("../")) {
    return relativeToRepoRoot;
  }
  const trimmedOriginal = originalPath.trim();
  if (trimmedOriginal) {
    return trimmedOriginal.split(path.sep).join("/");
  }
  return absolutePath.split(path.sep).join("/");
}

function splitContentLines(content: string | null): string[] {
  if (!content) {
    return [];
  }
  return content.replace(/\n$/, "").split("\n");
}

function buildSimpleDiff(
  filePath: string,
  beforeContent: string | null,
  afterContent: string | null,
): string {
  if (beforeContent === afterContent) {
    return "";
  }
  const beforeLines = splitContentLines(beforeContent);
  const afterLines = splitContentLines(afterContent);
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

type ChangeReviewCompareRow = {
  leftNumber: number | null;
  rightNumber: number | null;
  leftText: string;
  rightText: string;
  leftKind: "context" | "removed" | "empty";
  rightKind: "context" | "added" | "empty";
};

function buildChangeReviewCompareRows(
  beforeContent: string | null,
  afterContent: string | null,
): ChangeReviewCompareRow[] {
  const beforeLines = splitContentLines(beforeContent);
  const afterLines = splitContentLines(afterContent);
  const width = afterLines.length + 1;
  const matrix = new Uint32Array((beforeLines.length + 1) * width);
  for (let leftIndex = beforeLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = afterLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      const currentIndex = leftIndex * width + rightIndex;
      if (beforeLines[leftIndex] === afterLines[rightIndex]) {
        matrix[currentIndex] = matrix[(leftIndex + 1) * width + rightIndex + 1] + 1;
      } else {
        matrix[currentIndex] = Math.max(
          matrix[(leftIndex + 1) * width + rightIndex],
          matrix[leftIndex * width + rightIndex + 1],
        );
      }
    }
  }

  const rows: ChangeReviewCompareRow[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < beforeLines.length && rightIndex < afterLines.length) {
    if (beforeLines[leftIndex] === afterLines[rightIndex]) {
      rows.push({
        leftNumber: leftIndex + 1,
        rightNumber: rightIndex + 1,
        leftText: beforeLines[leftIndex] ?? "",
        rightText: afterLines[rightIndex] ?? "",
        leftKind: "context",
        rightKind: "context",
      });
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    const removeScore = matrix[(leftIndex + 1) * width + rightIndex];
    const addScore = matrix[leftIndex * width + rightIndex + 1];
    if (removeScore >= addScore) {
      rows.push({
        leftNumber: leftIndex + 1,
        rightNumber: null,
        leftText: beforeLines[leftIndex] ?? "",
        rightText: "",
        leftKind: "removed",
        rightKind: "empty",
      });
      leftIndex += 1;
      continue;
    }
    rows.push({
      leftNumber: null,
      rightNumber: rightIndex + 1,
      leftText: "",
      rightText: afterLines[rightIndex] ?? "",
      leftKind: "empty",
      rightKind: "added",
    });
    rightIndex += 1;
  }
  while (leftIndex < beforeLines.length) {
    rows.push({
      leftNumber: leftIndex + 1,
      rightNumber: null,
      leftText: beforeLines[leftIndex] ?? "",
      rightText: "",
      leftKind: "removed",
      rightKind: "empty",
    });
    leftIndex += 1;
  }
  while (rightIndex < afterLines.length) {
    rows.push({
      leftNumber: null,
      rightNumber: rightIndex + 1,
      leftText: "",
      rightText: afterLines[rightIndex] ?? "",
      leftKind: "empty",
      rightKind: "added",
    });
    rightIndex += 1;
  }
  return rows;
}

function buildChangeReviewHunks(
  beforeContent: string | null,
  afterContent: string | null,
): ChangeReviewHunkRecord[] {
  const rows = buildChangeReviewCompareRows(beforeContent, afterContent);
  const hunks: ChangeReviewHunkRecord[] = [];
  const pushRows = (pendingRows: ChangeReviewCompareRow[]) => {
    if (pendingRows.length === 0) {
      return;
    }
    const beforeNumbers = pendingRows
      .map((row) => row.leftNumber)
      .filter((value): value is number => value != null);
    const afterNumbers = pendingRows
      .map((row) => row.rightNumber)
      .filter((value): value is number => value != null);
    const beforeLines = pendingRows
      .filter((row) => row.leftKind === "removed")
      .map((row) => row.leftText);
    const afterLines = pendingRows
      .filter((row) => row.rightKind === "added")
      .map((row) => row.rightText);
    const beforeStartLine = beforeNumbers[0] ?? 0;
    const beforeEndLine = beforeNumbers[beforeNumbers.length - 1] ?? beforeStartLine;
    const afterStartLine = afterNumbers[0] ?? 0;
    const afterEndLine = afterNumbers[afterNumbers.length - 1] ?? afterStartLine;
    const changeType: ChangeReviewChangeType =
      beforeLines.length === 0 ? "added" : afterLines.length === 0 ? "deleted" : "modified";
    hunks.push({
      hunkId: `hunk-${hunks.length + 1}-${beforeStartLine}-${afterStartLine}`,
      changeType,
      beforeStartLine,
      beforeEndLine,
      afterStartLine,
      afterEndLine,
      beforeLines,
      afterLines,
    });
  };

  let pendingRows: ChangeReviewCompareRow[] = [];
  const flushPendingRows = () => {
    if (pendingRows.length === 0) {
      return;
    }
    pushRows(pendingRows);
    pendingRows = [];
  };

  for (const row of rows) {
    const changed = row.leftKind !== "context" || row.rightKind !== "context";
    if (!changed) {
      flushPendingRows();
      continue;
    }
    pendingRows.push(row);
  }
  flushPendingRows();
  return hunks;
}

function deriveChangeType(
  beforeContent: string | null,
  afterContent: string | null,
): ChangeReviewChangeType {
  return beforeContent == null && afterContent != null
    ? "added"
    : beforeContent != null && afterContent == null
      ? "deleted"
      : "modified";
}

function buildGroupTitle(changeType: ChangeReviewGroupRecord["changeType"], count: number): string {
  if (changeType === "added") {
    return `新增 ${count} 处内容`;
  }
  if (changeType === "deleted") {
    return `删除 ${count} 处内容`;
  }
  if (changeType === "modified") {
    return `修改 ${count} 处内容`;
  }
  return `调整 ${count} 处内容`;
}

function buildGroupSummary(
  changeType: ChangeReviewGroupRecord["changeType"],
  count: number,
): string {
  if (changeType === "added") {
    return `新增 ${count} 处内容`;
  }
  if (changeType === "deleted") {
    return `删除 ${count} 处内容`;
  }
  if (changeType === "modified") {
    return `修改 ${count} 处内容`;
  }
  return `混合调整 ${count} 处内容`;
}

function buildChangeReviewGroups(
  filePath: string,
  hunks: ChangeReviewHunkRecord[],
): ChangeReviewGroupRecord[] {
  if (hunks.length === 0) {
    return [];
  }
  const groups: ChangeReviewGroupRecord[] = [];
  const maxGap = 6;
  let pending: ChangeReviewHunkRecord[] = [];
  const flush = () => {
    if (pending.length === 0) {
      return;
    }
    const first = pending[0];
    const last = pending[pending.length - 1];
    const typeSet = new Set(pending.map((hunk) => hunk.changeType));
    const changeType =
      typeSet.size === 1
        ? (pending[0].changeType as ChangeReviewGroupRecord["changeType"])
        : "mixed";
    const count = pending.length;
    groups.push({
      groupId: `group-${groups.length + 1}-${first.beforeStartLine}-${first.afterStartLine}`,
      title: buildGroupTitle(changeType, count),
      summary: buildGroupSummary(changeType, count),
      changeType,
      filePath,
      hunkIds: pending.map((hunk) => hunk.hunkId),
      beforeStartLine: first.beforeStartLine,
      beforeEndLine: last.beforeEndLine,
      afterStartLine: first.afterStartLine,
      afterEndLine: last.afterEndLine,
      beforePreview: pending.flatMap((hunk) => hunk.beforeLines).slice(0, 3),
      afterPreview: pending.flatMap((hunk) => hunk.afterLines).slice(0, 3),
      hunkCount: count,
    });
    pending = [];
  };

  const sortedHunks = [...hunks].toSorted((left, right) => {
    const leftLine = left.afterStartLine || left.beforeStartLine;
    const rightLine = right.afterStartLine || right.beforeStartLine;
    return leftLine - rightLine;
  });

  for (const hunk of sortedHunks) {
    if (pending.length === 0) {
      pending.push(hunk);
      continue;
    }
    const previous = pending[pending.length - 1];
    const beforeGap = Math.abs(
      (hunk.beforeStartLine || previous.beforeEndLine) - previous.beforeEndLine,
    );
    const afterGap = Math.abs(
      (hunk.afterStartLine || previous.afterEndLine) - previous.afterEndLine,
    );
    const sameType = previous.changeType === hunk.changeType;
    const shouldMerge =
      (beforeGap <= maxGap || afterGap <= maxGap) && (sameType || beforeGap <= 2 || afterGap <= 2);
    if (shouldMerge) {
      pending.push(hunk);
      continue;
    }
    flush();
    pending.push(hunk);
  }
  flush();
  return groups;
}

function buildFileRecord(params: {
  path: string;
  absolutePath: string;
  beforeContent: string | null;
  afterContent: string | null;
}): ChangeReviewFileRecord {
  const changeType = deriveChangeType(params.beforeContent, params.afterContent);
  const hunks = buildChangeReviewHunks(params.beforeContent, params.afterContent);
  return {
    path: params.path,
    absolutePath: params.absolutePath,
    changeType,
    beforeContent: params.beforeContent,
    afterContent: params.afterContent,
    diffText: buildSimpleDiff(params.path, params.beforeContent, params.afterContent),
    hunks,
    groups: buildChangeReviewGroups(params.path, hunks),
  };
}

function mergeFileRecord(
  existing: ChangeReviewFileRecord | undefined,
  next: ChangeReviewFileRecord,
): ChangeReviewFileRecord {
  if (!existing) {
    return next;
  }
  return buildFileRecord({
    path: existing.path,
    absolutePath: existing.absolutePath,
    beforeContent: existing.beforeContent,
    afterContent: next.afterContent,
  });
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

function resolveFileHunkOrThrow(
  file: ChangeReviewFileRecord,
  hunkId: string,
): ChangeReviewHunkRecord {
  const normalized = hunkId.trim();
  const hunk = file.hunks.find((entry) => entry.hunkId === normalized);
  if (!hunk) {
    throw new Error(`hunk not found in review file: ${normalized}`);
  }
  return hunk;
}

function resolveFileGroupOrThrow(
  file: ChangeReviewFileRecord,
  groupId: string,
): ChangeReviewGroupRecord {
  const normalized = groupId.trim();
  const group = file.groups.find((entry) => entry.groupId === normalized);
  if (!group) {
    throw new Error(`group not found in review file: ${normalized}`);
  }
  return group;
}

function spliceContentLines(params: {
  targetContent: string | null;
  startIndex: number;
  deleteCount: number;
  replacementLines: string[];
}): string | null {
  const targetLines = splitContentLines(params.targetContent);
  const nextLines = [
    ...targetLines.slice(0, params.startIndex),
    ...params.replacementLines,
    ...targetLines.slice(params.startIndex + params.deleteCount),
  ];
  return nextLines.length > 0 ? `${nextLines.join("\n")}\n` : null;
}

function resolveNextFileAfterHunkAction(params: {
  file: ChangeReviewFileRecord;
  hunk: ChangeReviewHunkRecord;
  action: "apply" | "revert";
}): ChangeReviewFileRecord {
  const { file, hunk, action } = params;
  if (action === "apply") {
    const nextBeforeContent =
      hunk.changeType === "added"
        ? spliceContentLines({
            targetContent: file.beforeContent,
            startIndex: Math.max(hunk.afterStartLine - 1, 0),
            deleteCount: 0,
            replacementLines: hunk.afterLines,
          })
        : hunk.changeType === "deleted"
          ? spliceContentLines({
              targetContent: file.beforeContent,
              startIndex: Math.max(hunk.beforeStartLine - 1, 0),
              deleteCount: hunk.beforeLines.length,
              replacementLines: [],
            })
          : spliceContentLines({
              targetContent: file.beforeContent,
              startIndex: Math.max(hunk.beforeStartLine - 1, 0),
              deleteCount: hunk.beforeLines.length,
              replacementLines: hunk.afterLines,
            });
    return buildFileRecord({
      path: file.path,
      absolutePath: file.absolutePath,
      beforeContent: nextBeforeContent,
      afterContent: file.afterContent,
    });
  }
  const nextAfterContent =
    hunk.changeType === "added"
      ? spliceContentLines({
          targetContent: file.afterContent,
          startIndex: Math.max(hunk.afterStartLine - 1, 0),
          deleteCount: hunk.afterLines.length,
          replacementLines: [],
        })
      : hunk.changeType === "deleted"
        ? spliceContentLines({
            targetContent: file.afterContent,
            startIndex: Math.max(hunk.beforeStartLine - 1, 0),
            deleteCount: 0,
            replacementLines: hunk.beforeLines,
          })
        : spliceContentLines({
            targetContent: file.afterContent,
            startIndex: Math.max(hunk.afterStartLine - 1, 0),
            deleteCount: hunk.afterLines.length,
            replacementLines: hunk.beforeLines,
          });
  return buildFileRecord({
    path: file.path,
    absolutePath: file.absolutePath,
    beforeContent: file.beforeContent,
    afterContent: nextAfterContent,
  });
}

async function writeEffectiveFileContent(
  file: ChangeReviewFileRecord,
  stagedOnly: boolean,
): Promise<void> {
  const effectiveContent = stagedOnly ? file.beforeContent : file.afterContent;
  if (effectiveContent == null) {
    await fs.rm(file.absolutePath, { force: true });
    return;
  }
  await ensureParentDir(file.absolutePath);
  await fs.writeFile(file.absolutePath, effectiveContent, "utf-8");
}

function sortHunksForApply(hunks: ChangeReviewHunkRecord[]): ChangeReviewHunkRecord[] {
  return [...hunks].toSorted((left, right) => {
    const leftIndex = left.changeType === "added" ? left.afterStartLine : left.beforeStartLine;
    const rightIndex = right.changeType === "added" ? right.afterStartLine : right.beforeStartLine;
    return rightIndex - leftIndex;
  });
}

function sortHunksForRevert(hunks: ChangeReviewHunkRecord[]): ChangeReviewHunkRecord[] {
  return [...hunks].toSorted((left, right) => {
    const leftIndex = left.changeType === "deleted" ? left.beforeStartLine : left.afterStartLine;
    const rightIndex =
      right.changeType === "deleted" ? right.beforeStartLine : right.afterStartLine;
    return rightIndex - leftIndex;
  });
}

function resolveNextFileAfterGroupAction(params: {
  file: ChangeReviewFileRecord;
  group: ChangeReviewGroupRecord;
  action: "apply" | "revert";
}): ChangeReviewFileRecord {
  const { file, group, action } = params;
  const groupHunks = group.hunkIds.map((hunkId) => resolveFileHunkOrThrow(file, hunkId));
  if (action === "apply") {
    let nextBeforeContent = file.beforeContent;
    for (const hunk of sortHunksForApply(groupHunks)) {
      nextBeforeContent = resolveNextFileAfterHunkAction({
        file: buildFileRecord({
          path: file.path,
          absolutePath: file.absolutePath,
          beforeContent: nextBeforeContent,
          afterContent: file.afterContent,
        }),
        hunk,
        action,
      }).beforeContent;
    }
    return buildFileRecord({
      path: file.path,
      absolutePath: file.absolutePath,
      beforeContent: nextBeforeContent,
      afterContent: file.afterContent,
    });
  }
  let nextAfterContent = file.afterContent;
  for (const hunk of sortHunksForRevert(groupHunks)) {
    nextAfterContent = resolveNextFileAfterHunkAction({
      file: buildFileRecord({
        path: file.path,
        absolutePath: file.absolutePath,
        beforeContent: file.beforeContent,
        afterContent: nextAfterContent,
      }),
      hunk,
      action,
    }).afterContent;
  }
  return buildFileRecord({
    path: file.path,
    absolutePath: file.absolutePath,
    beforeContent: file.beforeContent,
    afterContent: nextAfterContent,
  });
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
    const displayPath = normalizeDisplayPath(filePath, absolutePath, params.repoRoot);
    if (!displayPath) {
      continue;
    }
    files.push({
      relativePath: displayPath,
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
  const changedRecords: ChangeReviewFileRecord[] = [];
  for (const file of snapshot.files) {
    const afterContent = await readFileMaybe(file.absolutePath);
    if (file.beforeContent === afterContent) {
      continue;
    }
    changedRecords.push(
      buildFileRecord({
        path: file.relativePath,
        absolutePath: file.absolutePath,
        beforeContent: file.beforeContent,
        afterContent,
      }),
    );
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
  files: Array<
    Omit<ChangeReviewFileRecord, "hunks" | "groups"> & {
      hunks?: ChangeReviewHunkRecord[];
      groups?: ChangeReviewGroupRecord[];
    }
  >;
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
  bundle.files = params.files.map((file) => {
    const normalized = buildFileRecord({
      path: file.path,
      absolutePath: file.absolutePath,
      beforeContent: file.beforeContent,
      afterContent: file.afterContent,
    });
    return {
      ...normalized,
      hunks:
        file.hunks && file.hunks.length > 0
          ? file.hunks.map((hunk) => ({ ...hunk }))
          : normalized.hunks,
    };
  });
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
  if (!bundle.stagedOnly) {
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

export async function applyReviewBundleGroup(
  reviewId: string,
  filePath: string,
  groupId: string,
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
  }
  const group = resolveFileGroupOrThrow(file, groupId);
  const nextFile = resolveNextFileAfterGroupAction({ file, group, action: "apply" });
  if (bundle.stagedOnly) {
    await writeEffectiveFileContent(nextFile, true);
  }
  bundle.files = bundle.files
    .map((entry) => (entry.path === file.path ? nextFile : entry))
    .filter((entry) => entry.beforeContent !== entry.afterContent);
  return finalizeBundleAfterPartialAction(bundle, reviewId, "applied");
}

export async function revertReviewBundleGroup(
  reviewId: string,
  filePath: string,
  groupId: string,
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
  }
  const group = resolveFileGroupOrThrow(file, groupId);
  const nextFile = resolveNextFileAfterGroupAction({ file, group, action: "revert" });
  if (!bundle.stagedOnly) {
    await writeEffectiveFileContent(nextFile, false);
  }
  bundle.files = bundle.files
    .map((entry) => (entry.path === file.path ? nextFile : entry))
    .filter((entry) => entry.beforeContent !== entry.afterContent);
  return finalizeBundleAfterPartialAction(bundle, reviewId, "reverted");
}

export async function applyReviewBundleHunk(
  reviewId: string,
  filePath: string,
  hunkId: string,
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
  }
  const hunk = resolveFileHunkOrThrow(file, hunkId);
  const nextFile = resolveNextFileAfterHunkAction({ file, hunk, action: "apply" });
  if (bundle.stagedOnly) {
    await writeEffectiveFileContent(nextFile, true);
  }
  bundle.files = bundle.files
    .map((entry) => (entry.path === file.path ? nextFile : entry))
    .filter((entry) => entry.beforeContent !== entry.afterContent);
  return finalizeBundleAfterPartialAction(bundle, reviewId, "applied");
}

export async function revertReviewBundleHunk(
  reviewId: string,
  filePath: string,
  hunkId: string,
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
  }
  const hunk = resolveFileHunkOrThrow(file, hunkId);
  const nextFile = resolveNextFileAfterHunkAction({ file, hunk, action: "revert" });
  if (!bundle.stagedOnly) {
    await writeEffectiveFileContent(nextFile, false);
  }
  bundle.files = bundle.files
    .map((entry) => (entry.path === file.path ? nextFile : entry))
    .filter((entry) => entry.beforeContent !== entry.afterContent);
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
      hunks: file.hunks.map((hunk) => ({
        hunkId: hunk.hunkId,
        changeType: hunk.changeType,
        beforeStartLine: hunk.beforeStartLine,
        beforeEndLine: hunk.beforeEndLine,
        afterStartLine: hunk.afterStartLine,
        afterEndLine: hunk.afterEndLine,
        beforeLines: [...hunk.beforeLines],
        afterLines: [...hunk.afterLines],
      })),
      groups: file.groups.map((group) => ({
        groupId: group.groupId,
        title: group.title,
        summary: group.summary,
        changeType: group.changeType,
        filePath: group.filePath,
        hunkIds: [...group.hunkIds],
        beforeStartLine: group.beforeStartLine,
        beforeEndLine: group.beforeEndLine,
        afterStartLine: group.afterStartLine,
        afterEndLine: group.afterEndLine,
        beforePreview: [...group.beforePreview],
        afterPreview: [...group.afterPreview],
        hunkCount: group.hunkCount,
      })),
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
