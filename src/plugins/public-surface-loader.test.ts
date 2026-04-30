import { describe, expect, it } from "vitest";
import {
  loadBundledPluginPublicArtifactModuleSync,
  resetBundledPluginPublicArtifactLoaderForTest,
  resolveBundledPluginPublicArtifactPath,
} from "./public-surface-loader.js";

describe("plugins/public-surface-loader", () => {
  it("resolves and loads bundled public artifact modules from the repo surface", () => {
    const resolved = resolveBundledPluginPublicArtifactPath({
      dirName: "qa-channel",
      artifactBasename: "runtime-api.js",
    });
    expect(resolved).toContain("qa-channel");

    const loaded = loadBundledPluginPublicArtifactModuleSync<Record<string, unknown>>({
      dirName: "qa-channel",
      artifactBasename: "runtime-api.js",
    });
    expect(typeof loaded).toBe("object");
  });

  it("can reset bundled public artifact loader caches between loads", () => {
    const first = loadBundledPluginPublicArtifactModuleSync<Record<string, unknown>>({
      dirName: "qa-channel",
      artifactBasename: "runtime-api.js",
    });
    resetBundledPluginPublicArtifactLoaderForTest();
    const second = loadBundledPluginPublicArtifactModuleSync<Record<string, unknown>>({
      dirName: "qa-channel",
      artifactBasename: "runtime-api.js",
    });
    expect(typeof first).toBe("object");
    expect(typeof second).toBe("object");
  });
});
