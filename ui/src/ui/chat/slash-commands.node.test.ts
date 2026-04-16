import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import {
  parseSlashCommand,
  refreshSlashCommands,
  resetSlashCommandsForTest,
  SLASH_COMMANDS,
} from "./slash-commands.ts";

afterEach(async () => {
  resetSlashCommandsForTest();
  await i18n.setLocale("en");
});

describe("parseSlashCommand", () => {
  it("parses commands with an optional colon separator", () => {
    expect(parseSlashCommand("/think: high")).toMatchObject({
      command: { name: "think" },
      args: "high",
    });
    expect(parseSlashCommand("/think:high")).toMatchObject({
      command: { name: "think" },
      args: "high",
    });
    expect(parseSlashCommand("/help:")).toMatchObject({
      command: { name: "help" },
      args: "",
    });
  });

  it("still parses space-delimited commands", () => {
    expect(parseSlashCommand("/verbose full")).toMatchObject({
      command: { name: "verbose" },
      args: "full",
    });
  });

  it("parses fast commands", () => {
    expect(parseSlashCommand("/fast:on")).toMatchObject({
      command: { name: "fast" },
      args: "on",
    });
  });

  it("keeps /status on the agent path", () => {
    const status = SLASH_COMMANDS.find((entry) => entry.name === "status");
    expect(status?.executeLocal).not.toBe(true);
    expect(parseSlashCommand("/status")).toMatchObject({
      command: { name: "status" },
      args: "",
    });
  });

  it("includes shared /tools with shared arg hints", () => {
    const tools = SLASH_COMMANDS.find((entry) => entry.name === "tools");
    expect(tools).toMatchObject({
      key: "tools",
      description: "List available runtime tools.",
      argOptions: ["compact", "verbose"],
      executeLocal: false,
    });
    expect(parseSlashCommand("/tools verbose")).toMatchObject({
      command: { name: "tools" },
      args: "verbose",
    });
  });

  it("parses slash aliases through the shared registry", () => {
    const exportCommand = SLASH_COMMANDS.find((entry) => entry.key === "export-session");
    expect(exportCommand).toMatchObject({
      name: "export-session",
      aliases: ["export"],
      executeLocal: true,
    });
    expect(parseSlashCommand("/export")).toMatchObject({
      command: { key: "export-session" },
      args: "",
    });
    expect(parseSlashCommand("/export-session")).toMatchObject({
      command: { key: "export-session" },
      args: "",
    });
  });

  it("keeps canonical long-form slash names as the primary menu command", () => {
    expect(SLASH_COMMANDS.find((entry) => entry.key === "verbose")).toMatchObject({
      name: "verbose",
      aliases: ["v"],
    });
    expect(SLASH_COMMANDS.find((entry) => entry.key === "think")).toMatchObject({
      name: "think",
      aliases: expect.arrayContaining(["thinking", "t"]),
    });
  });

  it("keeps a single local /steer entry with the control-ui metadata", () => {
    const steerEntries = SLASH_COMMANDS.filter((entry) => entry.name === "steer");
    expect(steerEntries).toHaveLength(1);
    expect(steerEntries[0]).toMatchObject({
      key: "steer",
      description: "Inject a message into the active run.",
      args: "[id] <message>",
      aliases: expect.arrayContaining(["tell"]),
      executeLocal: true,
    });
  });

  it("keeps focus as a local slash command", () => {
    expect(parseSlashCommand("/focus")).toMatchObject({
      command: { key: "focus", executeLocal: true },
      args: "",
    });
  });

  it("refreshes runtime commands from commands.list so docks, plugins, and direct skills appear", async () => {
    const request = async (method: string) => {
      expect(method).toBe("commands.list");
      return {
        commands: [
          {
            name: "dock-discord",
            textAliases: ["/dock-discord", "/dock_discord"],
            description: "Switch to discord for replies.",
            source: "native",
            scope: "both",
            acceptsArgs: false,
            category: "docks",
          },
          {
            name: "dreaming",
            textAliases: ["/dreaming"],
            description: "Enable or disable memory dreaming.",
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

    expect(SLASH_COMMANDS.find((entry) => entry.name === "dock-discord")).toMatchObject({
      aliases: ["dock_discord"],
      category: "tools",
      executeLocal: false,
    });
    expect(SLASH_COMMANDS.find((entry) => entry.name === "dreaming")).toMatchObject({
      key: "dreaming",
      executeLocal: false,
    });
    expect(SLASH_COMMANDS.find((entry) => entry.name === "prose")).toMatchObject({
      key: "prose",
      executeLocal: false,
    });
    expect(parseSlashCommand("/dock_discord")).toMatchObject({
      command: { name: "dock-discord" },
      args: "",
    });
  });

  it("does not let remote commands collide with reserved local commands", async () => {
    const request = async () => ({
      commands: [
        {
          name: "redirect",
          textAliases: ["/redirect"],
          description: "Remote redirect impostor.",
          source: "plugin",
          scope: "both",
          acceptsArgs: true,
        },
        {
          name: "kill",
          textAliases: ["/kill"],
          description: "Remote kill impostor.",
          source: "plugin",
          scope: "both",
          acceptsArgs: true,
        },
      ],
    });

    await refreshSlashCommands({
      client: { request } as never,
      agentId: "main",
    });

    expect(SLASH_COMMANDS.find((entry) => entry.name === "redirect")).toMatchObject({
      key: "redirect",
      executeLocal: true,
      description: "Abort and restart with a new message",
    });
    expect(SLASH_COMMANDS.find((entry) => entry.name === "kill")).toMatchObject({
      key: "kill",
      executeLocal: true,
      description: "Kill a running subagent, or all subagents.",
    });
  });

  it("drops remote commands with unsafe identifiers before they reach the palette/parser", async () => {
    const request = async () => ({
      commands: [
        {
          name: "prose now",
          textAliases: ["/prose now", "/safe-name"],
          description: "Unsafe injected command.",
          source: "skill",
          scope: "both",
          acceptsArgs: true,
        },
        {
          name: "bad:alias",
          textAliases: ["/bad:alias"],
          description: "Unsafe alias command.",
          source: "plugin",
          scope: "both",
          acceptsArgs: false,
        },
      ],
    });

    await refreshSlashCommands({
      client: { request } as never,
      agentId: "main",
    });

    expect(SLASH_COMMANDS.find((entry) => entry.name === "safe-name")).toMatchObject({
      name: "safe-name",
    });
    expect(SLASH_COMMANDS.find((entry) => entry.name === "prose now")).toBeUndefined();
    expect(SLASH_COMMANDS.find((entry) => entry.name === "bad:alias")).toBeUndefined();
    expect(parseSlashCommand("/safe-name")).toMatchObject({
      command: { name: "safe-name" },
    });
  });

  it("caps remote command payload size and long metadata before it reaches UI state", async () => {
    const longName = "x".repeat(260);
    const longDescription = "d".repeat(2_500);
    const request = async () => ({
      commands: Array.from({ length: 520 }, (_, index) => ({
        name: `plugin-${index}`,
        textAliases: Array.from(
          { length: 25 },
          (_, aliasIndex) => `/plugin-${index}-${aliasIndex}`,
        ),
        description: longDescription,
        source: "plugin" as const,
        scope: "both" as const,
        acceptsArgs: true,
        args: Array.from({ length: 25 }, (_, argIndex) => ({
          name: `${longName}-${argIndex}`,
          description: longDescription,
          type: "string" as const,
          choices: Array.from({ length: 55 }, (_, choiceIndex) => ({
            value: `${longName}-${choiceIndex}`,
            label: `${longName}-${choiceIndex}`,
          })),
        })),
      })),
    });

    await refreshSlashCommands({
      client: { request } as never,
      agentId: "main",
    });

    const remoteCommands = SLASH_COMMANDS.filter((entry) => entry.name.startsWith("plugin-"));
    expect(remoteCommands).toHaveLength(500);
    const first = remoteCommands[0];
    expect(first.aliases).toHaveLength(19);
    expect(first.description.length).toBeLessThanOrEqual(2_000);
    expect(first.args?.split(" ")).toHaveLength(20);
    expect(first.argOptions).toHaveLength(50);
  });

  it("requests the gateway default agent when no explicit agentId is available", async () => {
    const request = vi.fn().mockResolvedValue({
      commands: [
        {
          name: "pair",
          textAliases: ["/pair"],
          description: "Generate setup codes.",
          source: "plugin",
          scope: "both",
          acceptsArgs: true,
        },
      ],
    });

    await refreshSlashCommands({
      client: { request } as never,
      agentId: undefined,
    });

    expect(request).toHaveBeenCalledWith("commands.list", {
      includeArgs: true,
      scope: "text",
    });
    expect(SLASH_COMMANDS.find((entry) => entry.name === "pair")).toBeDefined();
  });

  it("falls back safely when the gateway returns malformed command payload shapes", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ commands: { bad: "shape" } })
      .mockResolvedValueOnce({
        commands: [
          {
            name: "valid",
            textAliases: ["/valid"],
            description: 42,
            args: { nope: true },
          },
          {
            name: "pair",
            textAliases: ["/pair"],
            description: "Generate setup codes.",
            source: "plugin",
            scope: "both",
            acceptsArgs: true,
            args: [
              {
                name: "mode",
                required: "yes",
                choices: { broken: true },
              },
            ],
          },
        ],
      });

    await refreshSlashCommands({
      client: { request } as never,
      agentId: "main",
    });
    expect(SLASH_COMMANDS.find((entry) => entry.name === "pair")).toBeUndefined();
    expect(SLASH_COMMANDS.find((entry) => entry.name === "help")).toBeDefined();

    await refreshSlashCommands({
      client: { request } as never,
      agentId: "main",
    });
    expect(SLASH_COMMANDS.find((entry) => entry.name === "valid")).toMatchObject({
      name: "valid",
      description: "",
    });
    expect(SLASH_COMMANDS.find((entry) => entry.name === "pair")).toMatchObject({
      name: "pair",
    });
  });

  it("ignores stale refresh responses and keeps the latest command set", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const request = vi
      .fn()
      .mockImplementationOnce(async () => await first)
      .mockImplementationOnce(async () => ({
        commands: [
          {
            name: "pair",
            textAliases: ["/pair"],
            description: "Generate setup codes.",
            source: "plugin",
            scope: "both",
            acceptsArgs: true,
          },
        ],
      }));

    const pending = refreshSlashCommands({
      client: { request } as never,
      agentId: "main",
    });
    await refreshSlashCommands({
      client: { request } as never,
      agentId: "main",
    });
    if (resolveFirst) {
      resolveFirst({
        commands: [
          {
            name: "dreaming",
            textAliases: ["/dreaming"],
            description: "Enable or disable memory dreaming.",
            source: "plugin",
            scope: "both",
            acceptsArgs: true,
          },
        ],
      });
    }
    await pending;

    expect(SLASH_COMMANDS.find((entry) => entry.name === "pair")).toBeDefined();
    expect(SLASH_COMMANDS.find((entry) => entry.name === "dreaming")).toBeUndefined();
  });

  it("maps all builtin command descriptions to zh-CN translations", async () => {
    await i18n.setLocale("zh-CN");
    resetSlashCommandsForTest();

    const expected = new Map([
      ["help", "显示可用命令。"],
      ["commands", "列出全部斜杠命令。"],
      ["tools", "列出可用运行时工具。"],
      ["skill", "按名称运行技能。"],
      ["status", "显示当前状态。"],
      ["tasks", "列出此会话的后台任务。"],
      ["allowlist", "列出、添加或移除 allowlist 条目。"],
      ["approve", "批准或拒绝 exec 请求。"],
      ["context", "说明上下文是如何构建和使用的。"],
      ["btw", "提出一个旁支问题，而不改变后续会话上下文。"],
      ["export-session", "将当前会话导出为包含完整 system prompt 的 HTML 文件。"],
      ["tts", "控制文字转语音（TTS）。"],
      ["whoami", "显示你的发送者标识。"],
      ["session", "管理会话级设置（例如 /session idle）。"],
      ["subagents", "列出、终止、查看日志、启动或引导本会话的子代理运行。"],
      ["acp", "管理 ACP 会话和运行时选项。"],
      ["focus", "将当前线程（Discord）或话题/会话（Telegram）绑定到指定 session target。"],
      ["unfocus", "移除当前线程（Discord）或话题/会话（Telegram）的绑定。"],
      ["agents", "列出此会话绑定到线程的代理。"],
      ["kill", "终止正在运行的子代理，或终止全部子代理。"],
      ["steer", "向当前活动运行注入一条消息。"],
      ["config", "显示或设置配置值。"],
      ["mcp", "显示或设置 OpenClaw MCP 服务器。"],
      ["plugins", "列出、查看、启用或禁用插件。"],
      ["debug", "设置运行时调试覆盖项。"],
      ["usage", "显示用量页脚或成本摘要。"],
      ["stop", "停止当前运行。"],
      ["restart", "重启 OpenClaw。"],
      ["activation", "设置群组激活模式。"],
      ["send", "设置发送策略。"],
      ["reset", "重置当前会话。"],
      ["new", "开始一个新会话。"],
      ["compact", "压缩会话上下文。"],
      ["think", "设置思考等级。"],
      ["verbose", "切换详细模式。"],
      ["trace", "切换插件跟踪输出。"],
      ["fast", "切换快速模式。"],
      ["reasoning", "切换推理可见性。"],
      ["elevated", "切换提权模式。"],
      ["exec", "设置此会话的 exec 默认值。"],
      ["model", "显示或设置模型。"],
      ["models", "列出模型提供商或提供商下的模型。"],
      ["queue", "调整队列设置。"],
      ["bash", "运行宿主机 shell 命令（仅宿主机）。"],
      ["dock_telegram", "切换为通过 Telegram 回复。"],
      ["agent_browser", "面向 AI 代理的无头浏览器自动化 CLI，支持可访问性快照与基于 ref 的元素选择。"],
      ["cf_image_gen", "使用 Cloudflare Workers AI（Flux Schnell）生成图像。"],
      ["chart_image", "从数据生成出版级图表图像。"],
      ["clawdhub", "从 clawdhub.com 搜索、安装、更新和发布 agent skills。"],
      ["command_center", "OpenClaw 的任务指挥台，提供实时监控、用量和成本洞察。"],
      ["frontend_design", "用于创建精致现代界面的前端设计指南。"],
      ["markdown_converter", "使用 markitdown 将文档和文件转换为 Markdown。"],
      ["moltguard", "安装 MoltGuard 以防护提示注入、数据外泄和恶意命令。"],
      ["multi_search_engine", "支持高级操作符、筛选和隐私引擎的多搜索引擎集成。"],
      ["ocr_local", "使用 Tesseract.js 在本地从图片中提取文字。"],
      ["ontology", "用于结构化代理记忆和可组合技能的类型化知识图谱。"],
      ["planning_with_files", "使用 task_plan.md、findings.md 和 progress.md 的 Manus 风格文件规划。"],
      ["proactive_agent", "将代理从被动执行者升级为具备持久工作流的主动伙伴。"],
      ["senior_architect", "面向复杂软件系统的系统架构评审与技术决策支持。"],
      ["tdd_guide", "用于编写测试、夹具、mock 和提升覆盖率的测试驱动开发指南。"],
      ["web_search_plus", "支持多搜索提供方智能路由的统一搜索技能。"],
      ["clear", "清空聊天记录"],
      ["redirect", "中止当前运行并用新消息重新开始"],
    ]);

    for (const [key, description] of expected) {
      expect(SLASH_COMMANDS.find((entry) => entry.key === key)?.description).toBe(description);
    }
  });
});
