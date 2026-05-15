import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-plugin-loader-"));
  tempDirs.push(dir);
  return dir;
}

function writeBundledPluginFixture(id: string) {
  const pluginRoot = makeTempDir();
  fs.writeFileSync(
    path.join(pluginRoot, "openclaw.plugin.json"),
    JSON.stringify(
      {
        id,
        configSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(pluginRoot, "index.cjs"),
    `module.exports = { id: ${JSON.stringify(id)}, register() {} };`,
    "utf-8",
  );
  return pluginRoot;
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("jiti");
  delete process.env.OPENCLAW_BUNDLED_PLUGINS_DIR;
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("createPluginJitiLoader", () => {
  it("uses the bundled plugin module path as the jiti filename", async () => {
    const jitiLoaderCalls: Array<{ modulePath: string; jitiFilename?: string }> = [];
    vi.doMock("jiti", () => ({
      createJiti: (modulePath: string) => {
        jitiLoaderCalls.push({
          modulePath,
          jitiFilename: modulePath,
        });
        return () => ({
          default: {
            id: "demo",
            register() {},
          },
        });
      },
    }));

    const { loadOpenClawPlugins } = await import("./loader.js");

    const pluginRoot = writeBundledPluginFixture("demo");
    process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = pluginRoot;

    loadOpenClawPlugins({
      cache: false,
      workspaceDir: pluginRoot,
      onlyPluginIds: ["demo"],
      config: {
        plugins: {
          entries: {
            demo: {
              enabled: true,
            },
          },
        },
      },
    });

    const bundledPluginLoad = jitiLoaderCalls.find((call) => call.modulePath.endsWith("index.cjs"));
    expect(bundledPluginLoad).toBeDefined();
    expect(bundledPluginLoad?.jitiFilename).toBe(bundledPluginLoad?.modulePath);
  });
});
