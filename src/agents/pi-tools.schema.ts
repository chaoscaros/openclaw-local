import type { ModelCompatConfig } from "../config/types.models.js";
import { stripUnsupportedSchemaKeywords } from "../plugin-sdk/provider-tools.js";
import { resolveUnsupportedToolSchemaKeywords } from "../plugins/provider-model-compat.js";
import { copyPluginToolMeta } from "../plugins/tools.js";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";
import { copyChannelAgentToolMeta } from "./channel-tools.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import { cleanSchemaForGemini } from "./schema/clean-for-gemini.js";

function extractEnumValues(schema: unknown): unknown[] | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  const record = schema as Record<string, unknown>;
  if (Array.isArray(record.enum)) {
    return record.enum;
  }
  if ("const" in record) {
    return [record.const];
  }
  const variants = Array.isArray(record.anyOf)
    ? record.anyOf
    : Array.isArray(record.oneOf)
      ? record.oneOf
      : null;
  if (variants) {
    const values = variants.flatMap((variant) => {
      const extracted = extractEnumValues(variant);
      return extracted ?? [];
    });
    return values.length > 0 ? values : undefined;
  }
  return undefined;
}

function mergePropertySchemas(existing: unknown, incoming: unknown): unknown {
  if (!existing) {
    return incoming;
  }
  if (!incoming) {
    return existing;
  }

  const existingEnum = extractEnumValues(existing);
  const incomingEnum = extractEnumValues(incoming);
  if (existingEnum || incomingEnum) {
    const values = Array.from(new Set([...(existingEnum ?? []), ...(incomingEnum ?? [])]));
    const merged: Record<string, unknown> = {};
    for (const source of [existing, incoming]) {
      if (!source || typeof source !== "object") {
        continue;
      }
      const record = source as Record<string, unknown>;
      for (const key of ["title", "description", "default"]) {
        if (!(key in merged) && key in record) {
          merged[key] = record[key];
        }
      }
    }
    const types = new Set(values.map((value) => typeof value));
    if (types.size === 1) {
      merged.type = Array.from(types)[0];
    }
    merged.enum = values;
    return merged;
  }

  return existing;
}

type FlattenableVariantKey = "anyOf" | "oneOf";
type TopLevelConditionalKey = FlattenableVariantKey | "allOf";

function hasTopLevelArrayKeyword(
  schemaRecord: Record<string, unknown>,
  key: TopLevelConditionalKey,
): boolean {
  return Array.isArray(schemaRecord[key]);
}

function getFlattenableVariantKey(
  schemaRecord: Record<string, unknown>,
): FlattenableVariantKey | null {
  if (hasTopLevelArrayKeyword(schemaRecord, "anyOf")) {
    return "anyOf";
  }
  if (hasTopLevelArrayKeyword(schemaRecord, "oneOf")) {
    return "oneOf";
  }
  return null;
}

function getTopLevelConditionalKey(
  schemaRecord: Record<string, unknown>,
): TopLevelConditionalKey | null {
  return (
    getFlattenableVariantKey(schemaRecord) ??
    (hasTopLevelArrayKeyword(schemaRecord, "allOf") ? "allOf" : null)
  );
}

function hasTopLevelObjectSchema(
  schemaRecord: Record<string, unknown>,
  conditionalKey: TopLevelConditionalKey | null,
): boolean {
  return "type" in schemaRecord && "properties" in schemaRecord && conditionalKey === null;
}

function isObjectLikeSchemaMissingType(
  schemaRecord: Record<string, unknown>,
  conditionalKey: TopLevelConditionalKey | null,
): boolean {
  return (
    !("type" in schemaRecord) &&
    (typeof schemaRecord.properties === "object" || Array.isArray(schemaRecord.required)) &&
    conditionalKey === null
  );
}

function isTypedSchemaMissingProperties(
  schemaRecord: Record<string, unknown>,
  conditionalKey: TopLevelConditionalKey | null,
): boolean {
  return "type" in schemaRecord && !("properties" in schemaRecord) && conditionalKey === null;
}

function isTrulyEmptySchema(schemaRecord: Record<string, unknown>): boolean {
  return Object.keys(schemaRecord).length === 0;
}

function isSchemaRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/gu, "/").replace(/~0/gu, "~");
}

function resolveJsonPointerPath(value: unknown, segments: string[]): unknown {
  let current = value;
  for (const rawSegment of segments) {
    if (!rawSegment) {
      continue;
    }
    if (!current || typeof current !== "object") {
      return undefined;
    }
    const segment = decodeJsonPointerSegment(rawSegment);
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const SCHEMA_MAP_KEYS = new Set([
  "$defs",
  "definitions",
  "dependentSchemas",
  "patternProperties",
  "properties",
]);

const SCHEMA_OBJECT_KEYS = new Set([
  "additionalProperties",
  "contains",
  "else",
  "if",
  "items",
  "not",
  "propertyNames",
  "then",
]);

const SCHEMA_ARRAY_KEYS = new Set(["allOf", "anyOf", "items", "oneOf", "prefixItems"]);

const SCHEMA_LITERAL_KEYS = new Set(["const", "default", "enum", "examples"]);

function resolveLocalJsonPointer(rootDocument: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    return undefined;
  }
  return resolveJsonPointerPath(rootDocument, ref.slice(2).split("/"));
}

function inlineLocalToolSchemaRefsWithRoot(
  schema: unknown,
  rootDocument: unknown,
  refStack: Set<string> | undefined,
  state: { unresolvedLocalRefs: boolean },
): unknown {
  if (!schema || typeof schema !== "object") {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map((entry) =>
      inlineLocalToolSchemaRefsWithRoot(entry, rootDocument, refStack, state),
    );
  }

  const obj = schema as Record<string, unknown>;
  const refValue = typeof obj.$ref === "string" ? obj.$ref : undefined;
  if (refValue) {
    if (refStack?.has(refValue)) {
      return {};
    }
    const resolved = resolveLocalJsonPointer(rootDocument, refValue);
    if (resolved === undefined) {
      if (refValue.startsWith("#/")) {
        state.unresolvedLocalRefs = true;
      }
      return obj;
    }
    const nextRefStack = refStack ? new Set(refStack) : new Set<string>();
    nextRefStack.add(refValue);
    const inlined = inlineLocalToolSchemaRefsWithRoot(resolved, rootDocument, nextRefStack, state);
    if (!isSchemaRecord(inlined)) {
      return inlined;
    }
    const result: Record<string, unknown> = { ...inlined };
    for (const key of ["title", "description", "default", "examples"]) {
      if (key in obj) {
        result[key] = obj[key];
      }
    }
    if (obj.nullable === true) {
      result.nullable = true;
    }
    return result;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "$defs" || key === "definitions" || key === "components") {
      continue;
    }
    if (SCHEMA_LITERAL_KEYS.has(key)) {
      result[key] = value;
      continue;
    }
    if (SCHEMA_MAP_KEYS.has(key) && isSchemaRecord(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [
          entryKey,
          inlineLocalToolSchemaRefsWithRoot(entryValue, rootDocument, refStack, state),
        ]),
      );
      continue;
    }
    if (SCHEMA_OBJECT_KEYS.has(key) && isSchemaRecord(value)) {
      result[key] = inlineLocalToolSchemaRefsWithRoot(value, rootDocument, refStack, state);
      continue;
    }
    if (SCHEMA_ARRAY_KEYS.has(key) && Array.isArray(value)) {
      result[key] = value.map((entry) =>
        inlineLocalToolSchemaRefsWithRoot(entry, rootDocument, refStack, state),
      );
      continue;
    }
    result[key] = value;
  }
  if (state.unresolvedLocalRefs) {
    for (const key of ["$defs", "definitions", "components"]) {
      if (key in obj) {
        result[key] = obj[key];
      }
    }
  }
  return result;
}

function inlineLocalToolSchemaRefs(schema: unknown): unknown {
  if (!isSchemaRecord(schema)) {
    return schema;
  }
  return inlineLocalToolSchemaRefsWithRoot(schema, schema, undefined, {
    unresolvedLocalRefs: false,
  });
}

const OPENAPI_SCHEMA_ANNOTATION_KEYS = new Set([
  "discriminator",
  "externalDocs",
  "readOnly",
  "writeOnly",
  "xml",
  "example",
]);

function appendNullSchemaType(type: unknown): unknown {
  if (type === "null") {
    return type;
  }
  if (typeof type === "string") {
    return [type, "null"];
  }
  if (Array.isArray(type)) {
    return type.includes("null") ? type : [...type, "null"];
  }
  return type;
}

function isNullSchemaLike(schema: unknown): boolean {
  if (!isSchemaRecord(schema)) {
    return false;
  }
  if (schema.type === "null") {
    return true;
  }
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    return true;
  }
  if ("const" in schema && schema.const === null) {
    return true;
  }
  return Array.isArray(schema.enum) && schema.enum.includes(null);
}

function hasOpenApiComposition(schema: Record<string, unknown>): boolean {
  return ["allOf", "anyOf", "oneOf"].some((key) => Array.isArray(schema[key]));
}

function schemaCompositionAlreadyAllowsNull(schema: Record<string, unknown>): boolean {
  return (
    (Array.isArray(schema.anyOf) && schema.anyOf.some(isNullSchemaLike)) ||
    (Array.isArray(schema.oneOf) && schema.oneOf.some(isNullSchemaLike))
  );
}

function wrapNullableComposedSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (schemaCompositionAlreadyAllowsNull(schema)) {
    return schema;
  }
  return {
    anyOf: [schema, { type: "null" }],
  };
}

function normalizeOpenApiSchemaKeywords(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(normalizeOpenApiSchemaKeywords);
  }
  if (!isSchemaRecord(schema)) {
    return schema;
  }

  const nullable = schema.nullable === true;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "nullable" || OPENAPI_SCHEMA_ANNOTATION_KEYS.has(key)) {
      continue;
    }
    if (SCHEMA_LITERAL_KEYS.has(key)) {
      normalized[key] = value;
      continue;
    }
    if (SCHEMA_MAP_KEYS.has(key) && isSchemaRecord(value)) {
      normalized[key] = Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [
          entryKey,
          normalizeOpenApiSchemaKeywords(entryValue),
        ]),
      );
      continue;
    }
    if (key === "components") {
      normalized[key] = value;
      continue;
    }
    if (SCHEMA_OBJECT_KEYS.has(key) && isSchemaRecord(value)) {
      normalized[key] = normalizeOpenApiSchemaKeywords(value);
      continue;
    }
    if (SCHEMA_ARRAY_KEYS.has(key) && Array.isArray(value)) {
      normalized[key] = value.map(normalizeOpenApiSchemaKeywords);
      continue;
    }
    normalized[key] = value;
  }

  if (nullable) {
    if (hasOpenApiComposition(normalized)) {
      return wrapNullableComposedSchema(normalized);
    }
    if ("type" in normalized) {
      normalized.type = appendNullSchemaType(normalized.type);
    }
    if (Array.isArray(normalized.enum) && !normalized.enum.includes(null)) {
      normalized.enum = [...normalized.enum, null];
    }
  }

  return nullable ? normalized : normalized;
}

export function normalizeToolParameterSchema(
  schema: unknown,
  options?: { modelProvider?: string; modelId?: string; modelCompat?: ModelCompatConfig },
): unknown {
  const normalizedSchema = normalizeOpenApiSchemaKeywords(inlineLocalToolSchemaRefs(schema));
  const schemaRecord =
    normalizedSchema && typeof normalizedSchema === "object"
      ? (normalizedSchema as Record<string, unknown>)
      : undefined;
  if (!schemaRecord) {
    return normalizedSchema;
  }

  // Provider quirks:
  // - Gemini rejects several JSON Schema keywords, so we scrub those.
  // - OpenAI rejects function tool schemas unless the *top-level* is `type: "object"`.
  //   (TypeBox root unions compile to `{ anyOf: [...] }` without `type`).
  // - Anthropic expects full JSON Schema draft 2020-12 compliance.
  // - xAI rejects validation-constraint keywords (minLength, maxLength, etc.) outright.
  //
  // Normalize once here so callers can always pass `tools` through unchanged.
  const normalizedProvider = normalizeLowercaseStringOrEmpty(options?.modelProvider);
  const isGeminiProvider =
    normalizedProvider.includes("google") || normalizedProvider.includes("gemini");
  const isAnthropicProvider = normalizedProvider.includes("anthropic");
  const unsupportedToolSchemaKeywords = resolveUnsupportedToolSchemaKeywords(options?.modelCompat);

  function applyProviderCleaning(s: unknown): unknown {
    if (isGeminiProvider && !isAnthropicProvider) {
      return cleanSchemaForGemini(s);
    }
    if (unsupportedToolSchemaKeywords.size > 0) {
      return stripUnsupportedSchemaKeywords(s, unsupportedToolSchemaKeywords);
    }
    return s;
  }

  const conditionalKey = getTopLevelConditionalKey(schemaRecord);
  const flattenableVariantKey = getFlattenableVariantKey(schemaRecord);

  if (hasTopLevelObjectSchema(schemaRecord, conditionalKey)) {
    return applyProviderCleaning(schemaRecord);
  }

  if (isObjectLikeSchemaMissingType(schemaRecord, conditionalKey)) {
    return applyProviderCleaning({ ...schemaRecord, type: "object" });
  }

  if (isTypedSchemaMissingProperties(schemaRecord, conditionalKey)) {
    return applyProviderCleaning({ ...schemaRecord, properties: {} });
  }

  if (!flattenableVariantKey) {
    if (isTrulyEmptySchema(schemaRecord)) {
      // Handle the proven MCP no-parameter case: a truly empty schema object.
      return applyProviderCleaning({ type: "object", properties: {} });
    }
    if (conditionalKey === "allOf") {
      // Top-level `allOf` is not safely flattenable with the same heuristics we
      // use for unions. Keep it explicit rather than silently rewriting it.
      return applyProviderCleaning(normalizedSchema);
    }
    return applyProviderCleaning(normalizedSchema);
  }
  const variants = schemaRecord[flattenableVariantKey] as unknown[];
  const mergedProperties: Record<string, unknown> = {};
  const requiredCounts = new Map<string, number>();
  let objectVariants = 0;

  for (const entry of variants) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const props = (entry as { properties?: unknown }).properties;
    if (!props || typeof props !== "object") {
      continue;
    }
    objectVariants += 1;
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      if (!(key in mergedProperties)) {
        mergedProperties[key] = value;
        continue;
      }
      mergedProperties[key] = mergePropertySchemas(mergedProperties[key], value);
    }
    const required = Array.isArray((entry as { required?: unknown }).required)
      ? (entry as { required: unknown[] }).required
      : [];
    for (const key of required) {
      if (typeof key !== "string") {
        continue;
      }
      requiredCounts.set(key, (requiredCounts.get(key) ?? 0) + 1);
    }
  }

  const baseRequired = Array.isArray(schemaRecord.required)
    ? schemaRecord.required.filter((key) => typeof key === "string")
    : undefined;
  const mergedRequired =
    baseRequired && baseRequired.length > 0
      ? baseRequired
      : objectVariants > 0
        ? Array.from(requiredCounts.entries())
            .filter(([, count]) => count === objectVariants)
            .map(([key]) => key)
        : undefined;

  const nextSchema: Record<string, unknown> = { ...schemaRecord };
  const flattenedSchema = {
    type: "object",
    ...(typeof nextSchema.title === "string" ? { title: nextSchema.title } : {}),
    ...(typeof nextSchema.description === "string" ? { description: nextSchema.description } : {}),
    properties:
      Object.keys(mergedProperties).length > 0 ? mergedProperties : (schemaRecord.properties ?? {}),
    ...(mergedRequired && mergedRequired.length > 0 ? { required: mergedRequired } : {}),
    additionalProperties:
      "additionalProperties" in schemaRecord ? schemaRecord.additionalProperties : true,
  };

  // Flatten union schemas into a single object schema:
  // - Gemini doesn't allow top-level `type` together with `anyOf`.
  // - OpenAI rejects schemas without top-level `type: "object"`.
  // - Anthropic accepts proper JSON Schema with constraints.
  // Merging properties preserves useful enums like `action` while keeping schemas portable.
  return applyProviderCleaning(flattenedSchema);
}

export function normalizeToolParameters(
  tool: AnyAgentTool,
  options?: { modelProvider?: string; modelId?: string; modelCompat?: ModelCompatConfig },
): AnyAgentTool {
  function preserveToolMeta(target: AnyAgentTool): AnyAgentTool {
    copyPluginToolMeta(tool, target);
    copyChannelAgentToolMeta(tool as never, target as never);
    return target;
  }
  const schema =
    tool.parameters && typeof tool.parameters === "object"
      ? (tool.parameters as Record<string, unknown>)
      : undefined;
  if (!schema) {
    return tool;
  }
  return preserveToolMeta({
    ...tool,
    parameters: normalizeToolParameterSchema(schema, options),
  });
}

/**
 * @deprecated Use normalizeToolParameters with modelProvider instead.
 * This function should only be used for Gemini providers.
 */
export function cleanToolSchemaForGemini(schema: Record<string, unknown>): unknown {
  return cleanSchemaForGemini(schema);
}
