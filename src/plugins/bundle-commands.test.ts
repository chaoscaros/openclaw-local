import { afterEach, describe, expect, it } from "vitest";
import { loadEnabledClaudeBundleCommands } from "./bundle-commands.js";
import {
  createEnabledPluginEntries,
  createBundleMcpTempHarness,
  withBundleHomeEnv,
  writeBundleTextFiles,
  writeClaudeBundleManifest,
} from "./bundle-mcp.test-support.js";

const tempHarness = createBundleMcpTempHarness();

afterEach(async () => {
  await tempHarness.cleanup();
});

async function writeClaudeBundleCommandFixture(params: {
  homeDir: string;
  pluginId: string;
  commands: Array<{ relativePath: string; contents: string[] }>;
}): Promise<string> {
  const pluginRoot = await writeClaudeBundleManifest({
    homeDir: params.homeDir,
    pluginId: params.pluginId,
    manifest: { name: params.pluginId },
  });
  await writeBundleTextFiles(
    pluginRoot,
    Object.fromEntries(
      params.commands.map((command) => [
        command.relativePath,
        [...command.contents, ""].join("\n"),
      ]),
    ),
  );
  return pluginRoot;
}

function expectEnabledClaudeBundleCommands(
  commands: ReturnType<typeof loadEnabledClaudeBundleCommands>,
  expected: Array<{
    pluginId: string;
    rawName: string;
    description: string;
    promptTemplate: string;
  }>,
) {
  expect(commands).toEqual(
    expect.arrayContaining(expected.map((entry) => expect.objectContaining(entry))),
  );
}

describe("loadEnabledClaudeBundleCommands", () => {
  it("loads enabled Claude bundle markdown commands and skips disabled-model-invocation entries", async () => {
    await withBundleHomeEnv(
      tempHarness,
      "openclaw-bundle-commands",
      async ({ env, homeDir, workspaceDir }) => {
        const pluginRoot = await writeClaudeBundleCommandFixture({
          homeDir,
          pluginId: "compound-bundle",
          commands: [
            {
              relativePath: "commands/office-hours.md",
              contents: [
                "---",
                "description: Help with scoping and architecture",
                "---",
                "Give direct engineering advice.",
              ],
            },
            {
              relativePath: "commands/workflows/review.md",
              contents: [
                "---",
                "name: workflows:review",
                "description: Run a structured review",
                "---",
                "Review the code. $ARGUMENTS",
              ],
            },
            {
              relativePath: "commands/disabled.md",
              contents: ["---", "disable-model-invocation: true", "---", "Do not load me."],
            },
          ],
        });

        const commands = loadEnabledClaudeBundleCommands({
          workspaceDir,
          env,
          deps: {
            loadPluginManifestRegistry: () =>
              ({
                plugins: [
                  {
                    id: "compound-bundle",
                    format: "bundle",
                    bundleFormat: "claude",
                    bundleCapabilities: ["commands"],
                    origin: "global",
                    rootDir: pluginRoot,
                  },
                ],
                diagnostics: [],
              }) as never,
          },
          cfg: {
            plugins: {
              entries: createEnabledPluginEntries(["compound-bundle"]),
            },
          },
        });

        expectEnabledClaudeBundleCommands(commands, [
          {
            pluginId: "compound-bundle",
            rawName: "office-hours",
            description: "Help with scoping and architecture",
            promptTemplate: "Give direct engineering advice.",
          },
          {
            pluginId: "compound-bundle",
            rawName: "workflows:review",
            description: "Run a structured review",
            promptTemplate: "Review the code. $ARGUMENTS",
          },
        ]);
        expect(commands.some((entry) => entry.rawName === "disabled")).toBe(false);
      },
    );
  });
});
