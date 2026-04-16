import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { refreshSlashCommands, resetSlashCommandsForTest } from "../chat/slash-commands.ts";
import { getPaletteItems } from "./command-palette.ts";

afterEach(async () => {
  resetSlashCommandsForTest();
  await i18n.setLocale("en");
});

describe("command palette", () => {
  it("builds slash items from the live runtime command list", async () => {
    const request = async (method: string) => {
      expect(method).toBe("commands.list");
      return {
        commands: [
          {
            name: "pair",
            textAliases: ["/pair"],
            description: "Generate setup codes and approve device pairing requests.",
            source: "plugin",
            scope: "both",
            acceptsArgs: true,
          },
          {
            name: "prose",
            textAliases: ["/prose"],
            description: "Draft polished prose.",
            source: "skill",
            scope: "both",
            acceptsArgs: true,
          },
        ],
      };
    };

    await refreshSlashCommands({
      client: { request } as never,
      agentId: "main",
    });

    const items = getPaletteItems();
    expect(items).toContainEqual(
      expect.objectContaining({
        id: "slash:pair",
        label: "/pair",
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: "slash:prose",
        label: "/prose",
      }),
    );
  });

  it("uses translated labels, categories, and quick-action descriptions in zh-CN", async () => {
    await i18n.setLocale("zh-CN");
    resetSlashCommandsForTest();

    const items = getPaletteItems();
    expect(items).toContainEqual(
      expect.objectContaining({
        id: "nav-overview",
        label: "概览",
        category: "navigation",
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: "skill-shell",
        label: "Shell 命令",
        description: "运行 shell 技能命令。",
        category: "skills",
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: "skill-debug",
        label: "调试模式",
        description: "将 verbose 切换为完整输出。",
        category: "skills",
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: "slash:steer",
        description: "向当前活动运行注入一条消息。",
      }),
    );
  });
});
