import { Type } from "@sinclair/typebox";
import { describe, expect, it, vi } from "vitest";
import { normalizeToolParameterSchema, normalizeToolParameters } from "./pi-tools.schema.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

describe("normalizeToolParameterSchema", () => {
  it("normalizes truly empty schemas to type:object with properties:{}", () => {
    expect(normalizeToolParameterSchema({})).toEqual({
      type: "object",
      properties: {},
    });
  });

  it("leaves top-level allOf schemas unchanged", () => {
    const schema = {
      allOf: [{ type: "object", properties: { id: { type: "string" } } }],
    };

    expect(normalizeToolParameterSchema(schema)).toEqual(schema);
  });

  it("adds missing top-level type for raw object-ish schemas", () => {
    expect(
      normalizeToolParameterSchema({
        properties: { q: { type: "string" } },
        required: ["q"],
      }),
    ).toEqual({
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    });
  });

  it("inlines OpenAPI 3 component schema refs", () => {
    expect(
      normalizeToolParameterSchema({
        type: "object",
        required: ["pet"],
        properties: {
          pet: {
            $ref: "#/components/schemas/Pet",
            description: "Pet payload",
          },
        },
        components: {
          schemas: {
            Pet: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string" },
                tag: { type: "string", nullable: true },
              },
            },
          },
        },
      }),
    ).toEqual({
      type: "object",
      required: ["pet"],
      properties: {
        pet: {
          description: "Pet payload",
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            tag: { type: ["string", "null"] },
          },
        },
      },
    });
  });

  it("preserves OpenAPI nullable on direct component refs", () => {
    expect(
      normalizeToolParameterSchema({
        type: "object",
        properties: {
          pet: {
            $ref: "#/components/schemas/Pet",
            nullable: true,
          },
        },
        components: {
          schemas: {
            Pet: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
            },
          },
        },
      }),
    ).toEqual({
      type: "object",
      properties: {
        pet: {
          type: ["object", "null"],
          properties: {
            name: { type: "string" },
          },
        },
      },
    });
  });

  it("preserves OpenAPI components when a local component ref cannot be resolved", () => {
    expect(
      normalizeToolParameterSchema({
        type: "object",
        properties: {
          missing: { $ref: "#/components/schemas/Missing" },
        },
        components: {
          schemas: {
            Present: {
              type: "string",
            },
          },
        },
      }),
    ).toEqual({
      type: "object",
      properties: {
        missing: { $ref: "#/components/schemas/Missing" },
      },
      components: {
        schemas: {
          Present: {
            type: "string",
          },
        },
      },
    });
  });

  it("normalizes OpenAPI nullable and schema-only annotations", () => {
    expect(
      normalizeToolParameterSchema({
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["available"],
            nullable: true,
            readOnly: true,
            example: "available",
          },
        },
      }),
    ).toEqual({
      type: "object",
      properties: {
        status: {
          type: ["string", "null"],
          enum: ["available", null],
        },
      },
    });
  });

  it("does not treat object-valued schema literals as OpenAPI schema objects", () => {
    expect(
      normalizeToolParameterSchema({
        type: "object",
        properties: {
          payload: {
            type: "object",
            default: {
              example: "kept",
              nullable: true,
              readOnly: true,
              $ref: "#/components/schemas/NotASchema",
              xml: { name: "payload" },
            },
          },
        },
      }),
    ).toEqual({
      type: "object",
      properties: {
        payload: {
          type: "object",
          default: {
            example: "kept",
            nullable: true,
            readOnly: true,
            $ref: "#/components/schemas/NotASchema",
            xml: { name: "payload" },
          },
        },
      },
    });
  });
});

function makeTool(parameters: unknown): AnyAgentTool {
  return {
    name: "test_tool",
    label: "Test Tool",
    description: "test",
    parameters,
    execute: vi.fn(),
  };
}

describe("normalizeToolParameters", () => {
  it("normalizes truly empty schemas to type:object with properties:{} (MCP parameter-free tools)", () => {
    const tool: AnyAgentTool = {
      name: "get_flux_instance",
      label: "get_flux_instance",
      description: "Get current Flux instance status",
      parameters: {},
      execute: vi.fn(),
    };

    const normalized = normalizeToolParameters(tool);

    const parameters = normalized.parameters as Record<string, unknown>;
    expect(parameters.type).toBe("object");
    expect(parameters.properties).toEqual({});
  });

  it("does not rewrite non-empty schemas that still lack type/properties", () => {
    const tool: AnyAgentTool = {
      name: "conditional",
      label: "conditional",
      description: "Conditional schema stays untouched",
      parameters: { allOf: [] },
      execute: vi.fn(),
    };

    const normalized = normalizeToolParameters(tool);

    expect(normalized.parameters).toEqual({ allOf: [] });
  });

  it("injects properties:{} for type:object schemas missing properties (MCP no-param tools)", () => {
    const tool: AnyAgentTool = {
      name: "list_regions",
      label: "list_regions",
      description: "List all AWS regions",
      parameters: { type: "object" },
      execute: vi.fn(),
    };

    const normalized = normalizeToolParameters(tool);

    const parameters = normalized.parameters as Record<string, unknown>;
    expect(parameters.type).toBe("object");
    expect(parameters.properties).toEqual({});
  });

  it("preserves existing properties on type:object schemas", () => {
    const tool: AnyAgentTool = {
      name: "query",
      label: "query",
      description: "Run a query",
      parameters: { type: "object", properties: { q: { type: "string" } } },
      execute: vi.fn(),
    };

    const normalized = normalizeToolParameters(tool);

    const parameters = normalized.parameters as Record<string, unknown>;
    expect(parameters.type).toBe("object");
    expect(parameters.properties).toEqual({ q: { type: "string" } });
  });

  it("injects properties:{} for type:object with only additionalProperties", () => {
    const tool: AnyAgentTool = {
      name: "passthrough",
      label: "passthrough",
      description: "Accept any input",
      parameters: { type: "object", additionalProperties: true },
      execute: vi.fn(),
    };

    const normalized = normalizeToolParameters(tool);

    const parameters = normalized.parameters as Record<string, unknown>;
    expect(parameters.type).toBe("object");
    expect(parameters.properties).toEqual({});
    expect(parameters.additionalProperties).toBe(true);
  });

  it("strips compat-declared unsupported schema keywords without provider-specific branching", () => {
    const tool: AnyAgentTool = {
      name: "demo",
      label: "demo",
      description: "demo",
      parameters: Type.Object({
        count: Type.Integer({ minimum: 1, maximum: 5 }),
        query: Type.Optional(Type.String({ minLength: 2 })),
      }),
      execute: vi.fn(),
    };

    const normalized = normalizeToolParameters(tool, {
      modelCompat: {
        unsupportedToolSchemaKeywords: ["minimum", "maximum", "minLength"],
      },
    });

    const parameters = normalized.parameters as {
      required?: string[];
      properties?: Record<string, Record<string, unknown>>;
    };

    expect(parameters.required).toEqual(["count"]);
    expect(parameters.properties?.count.minimum).toBeUndefined();
    expect(parameters.properties?.count.maximum).toBeUndefined();
    expect(parameters.properties?.count.type).toBe("integer");
    expect(parameters.properties?.query.minLength).toBeUndefined();
    expect(parameters.properties?.query.type).toBe("string");
  });

  it("filters required to match properties when flattening anyOf for Gemini", () => {
    const tool = makeTool({
      type: "object",
      required: ["action", "amount", "token"],
      anyOf: [
        {
          type: "object",
          properties: {
            action: { type: "string", enum: ["buy"] },
            amount: { type: "number" },
          },
        },
        {
          type: "object",
          properties: {
            action: { type: "string", enum: ["sell"] },
            price: { type: "number" },
          },
        },
      ],
    });

    const result = normalizeToolParameters(tool, {
      modelProvider: "google",
    });

    const params = result.parameters as {
      required?: string[];
      properties?: Record<string, unknown>;
    };

    expect(params.required).not.toContain("token");
    expect(params.required).toContain("action");
    expect(params.properties).toHaveProperty("action");
    expect(params.properties).toHaveProperty("amount");
    expect(params.properties).toHaveProperty("price");
  });

  it("preserves extra required fields for non-Gemini providers", () => {
    const tool = makeTool({
      type: "object",
      required: ["action", "token"],
      anyOf: [
        {
          type: "object",
          properties: {
            action: { type: "string" },
          },
        },
      ],
    });

    const result = normalizeToolParameters(tool);
    const params = result.parameters as { required?: string[] };

    expect(params.required).toEqual(["action", "token"]);
  });

  it("keeps all required fields when they exist in merged properties", () => {
    const tool = makeTool({
      type: "object",
      required: ["action", "amount"],
      anyOf: [
        {
          type: "object",
          properties: {
            action: { type: "string" },
            amount: { type: "number" },
          },
        },
      ],
    });

    const result = normalizeToolParameters(tool, {
      modelProvider: "google",
    });

    const params = result.parameters as { required?: string[] };
    expect(params.required).toContain("action");
    expect(params.required).toContain("amount");
  });

  it("removes required entirely when no fields match merged properties", () => {
    const tool = makeTool({
      type: "object",
      required: ["ghost_a", "ghost_b"],
      anyOf: [
        {
          type: "object",
          properties: {
            real: { type: "string" },
          },
        },
      ],
    });

    const result = normalizeToolParameters(tool, {
      modelProvider: "google",
    });

    const params = result.parameters as { required?: string[] };
    expect(params.required).toBeUndefined();
  });

  it("drops inherited names like toString for Gemini", () => {
    const tool = makeTool({
      type: "object",
      required: ["toString", "name"],
      anyOf: [
        {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      ],
    });

    const result = normalizeToolParameters(tool, {
      modelProvider: "google",
    });

    const params = result.parameters as { required?: string[] };
    expect(params.required).toEqual(["name"]);
  });
});
