import fs from "node:fs/promises";
import type { ImageContent } from "@mariozechner/pi-ai";
import { logVerbose } from "../../globals.js";
import { formatErrorMessage } from "../../infra/errors.js";
import { mimeTypeFromFilePath, normalizeMimeType } from "../../media/mime.js";
import type { PromptImageOrderEntry } from "../../media/prompt-image-order.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import type { MsgContext } from "../templating.js";

const MAX_CURRENT_TURN_IMAGE_BYTES = 20 * 1024 * 1024;

type CurrentImageCandidate = {
  path: string;
  mimeType: string;
};

function collectCurrentImageCandidates(ctx: MsgContext): CurrentImageCandidate[] {
  const pathsFromArray = Array.isArray(ctx.MediaPaths) ? ctx.MediaPaths : undefined;
  const paths =
    pathsFromArray && pathsFromArray.length > 0
      ? pathsFromArray
      : normalizeOptionalString(ctx.MediaPath)
        ? [ctx.MediaPath]
        : [];
  if (paths.length === 0) {
    return [];
  }
  const types =
    Array.isArray(ctx.MediaTypes) && ctx.MediaTypes.length === paths.length
      ? ctx.MediaTypes
      : undefined;
  const candidates: CurrentImageCandidate[] = [];
  for (const [index, pathValue] of paths.entries()) {
    const mediaPath = normalizeOptionalString(pathValue);
    if (!mediaPath) {
      continue;
    }
    const declaredType = normalizeMimeType(types?.[index] ?? ctx.MediaType);
    const inferredType = mimeTypeFromFilePath(mediaPath);
    const mediaType =
      declaredType?.startsWith("image/") === true
        ? declaredType
        : inferredType?.startsWith("image/") === true
          ? inferredType
          : undefined;
    if (mediaType) {
      candidates.push({ path: mediaPath, mimeType: mediaType });
    }
  }
  return candidates;
}

async function readCurrentImage(candidate: CurrentImageCandidate): Promise<ImageContent> {
  const stat = await fs.stat(candidate.path);
  if (stat.size > MAX_CURRENT_TURN_IMAGE_BYTES) {
    throw new Error(
      `current turn image exceeds ${MAX_CURRENT_TURN_IMAGE_BYTES} byte limit: ${candidate.path}`,
    );
  }
  const data = await fs.readFile(candidate.path);
  return {
    type: "image",
    data: data.toString("base64"),
    mimeType: candidate.mimeType,
  };
}

export async function resolveCurrentTurnImages(params: {
  ctx: MsgContext;
  images?: ImageContent[];
  imageOrder?: PromptImageOrderEntry[];
}): Promise<{
  images?: ImageContent[];
  imageOrder?: PromptImageOrderEntry[];
}> {
  if (Array.isArray(params.images) && params.images.length > 0) {
    return { images: params.images, imageOrder: params.imageOrder };
  }

  const candidates = collectCurrentImageCandidates(params.ctx);
  if (candidates.length === 0) {
    return { images: params.images, imageOrder: params.imageOrder };
  }

  try {
    const images = await Promise.all(candidates.map((candidate) => readCurrentImage(candidate)));
    return images.length > 0
      ? { images, imageOrder: images.map(() => "inline" as const) }
      : { images: params.images, imageOrder: params.imageOrder };
  } catch (error) {
    logVerbose(
      `agent-runner: current turn image resolution failed, falling back to prompt image refs: ${formatErrorMessage(error)}`,
    );
    return { images: params.images, imageOrder: params.imageOrder };
  }
}
