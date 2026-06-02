import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  isCapabilityProviderConfigured,
  resolveCapabilityModelConfigForTool,
  resolveMediaToolLocalRoots,
} from "./media-tool-shared.js";

function normalizeHostPath(value: string): string {
  return path.normalize(path.resolve(value));
}

describe("resolveMediaToolLocalRoots", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not widen default local roots from media sources", () => {
    const stateDir = path.join("/tmp", "openclaw-media-tool-roots-state");
    const picturesDir =
      process.platform === "win32" ? "C:\\Users\\peter\\Pictures" : "/Users/peter/Pictures";
    const moviesDir =
      process.platform === "win32" ? "C:\\Users\\peter\\Movies" : "/Users/peter/Movies";

    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);

    const roots = resolveMediaToolLocalRoots(path.join(stateDir, "workspace-agent"), undefined, [
      path.join(picturesDir, "photo.png"),
      pathToFileURL(path.join(moviesDir, "clip.mp4")).href,
      "/top-level-file.png",
    ]);

    const normalizedRoots = roots.map(normalizeHostPath);
    expect(normalizedRoots).toContain(normalizeHostPath(path.join(stateDir, "workspace-agent")));
    expect(normalizedRoots).toContain(normalizeHostPath(path.join(stateDir, "workspace")));
    expect(normalizedRoots).not.toContain(normalizeHostPath(picturesDir));
    expect(normalizedRoots).not.toContain(normalizeHostPath(moviesDir));
    expect(normalizedRoots).not.toContain(normalizeHostPath("/"));
  });
});

describe("generation provider auth preflight", () => {
  it("accepts config-backed custom provider auth for generation providers", () => {
    const cfg = {
      models: {
        providers: {
          "custom-image": {
            baseUrl: "https://example.com/v1",
            apiKey: "sk-configured", // pragma: allowlist secret
            models: [],
          },
        },
      },
    } as OpenClawConfig;
    const providers = [{ id: "custom-image", defaultModel: "workflow" }];

    expect(
      isCapabilityProviderConfigured({
        providers,
        provider: providers[0],
        cfg,
      }),
    ).toBe(true);
    expect(
      resolveCapabilityModelConfigForTool({
        cfg,
        providers,
      }),
    ).toEqual({ primary: "custom-image/workflow" });
  });

  it("preserves provider-specific not-configured results over generic config auth", () => {
    const cfg = {
      models: {
        providers: {
          "workflow-image": {
            baseUrl: "https://example.com/v1",
            apiKey: "sk-configured", // pragma: allowlist secret
            models: [],
          },
        },
      },
    } as OpenClawConfig;
    const provider = {
      id: "workflow-image",
      defaultModel: "workflow",
      isConfigured: () => false,
    };

    expect(
      isCapabilityProviderConfigured({
        providers: [provider],
        provider,
        cfg,
      }),
    ).toBe(false);
    expect(
      resolveCapabilityModelConfigForTool({
        cfg,
        providers: [provider],
      }),
    ).toBeNull();
  });
});
