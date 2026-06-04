# 本地配置说明

## 配置入口

当前仓库根目录有两个最常用的本地配置入口：

- `openclaw.json`
- `.env.example`

`openclaw.json` 是本仓库的默认项目配置，目前只保留本地默认 skill：

```json
{
  "agents": {
    "defaults": {
      "skills": ["dev-spec-first"]
    }
  }
}
```

真实 token、账号密钥、运行状态目录不要写进 `openclaw.json`。

## .env 规则

`.env.example` 是环境变量模板。真实 `.env` 不要提交到 git。

常用环境变量：

- `OPENCLAW_GATEWAY_TOKEN`：gateway token。
- `OPENCLAW_GATEWAY_PASSWORD`：可选，和 token 二选一。
- `OPENCLAW_STATE_DIR`：状态目录，默认 `~/.openclaw`。
- `OPENCLAW_CONFIG_PATH`：运行配置文件路径，默认 `~/.openclaw/openclaw.json`。
- `OPENCLAW_HOME`：可选 home 覆盖。
- `OPENCLAW_LOAD_SHELL_ENV`：可选，从登录 shell profile 导入缺失环境变量。

模型、渠道、工具和语音密钥也优先放 `.env`，例如：

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `DISCORD_BOT_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `SLACK_BOT_TOKEN`
- `BRAVE_API_KEY`
- `DEEPGRAM_API_KEY`

## 初始化命令

推荐首次初始化顺序：

```bash
pnpm openclaw env init
# 手动编辑 ~/.openclaw/.env，确认 OPENCLAW_STATE_DIR 和 OPENCLAW_CONFIG_PATH
pnpm openclaw config init
pnpm openclaw agents init
```

常用初始化和清理命令：

```bash
pnpm openclaw env init
pnpm openclaw env token
pnpm openclaw config init
pnpm openclaw agents init
pnpm openclaw codex clean
```

对应实现和文档：

- `openclaw env init` / `openclaw env token`
  - 实现：`src/cli/env-cli.ts`
  - 文档：`docs/cli/env.md`
- `openclaw config init`
  - 实现：`src/cli/config-init.ts`
  - 文档：`docs/cli/config.md`
- `openclaw agents init`
  - 实现：`src/cli/agent-init.ts`
  - 文档：`docs/cli/agents.md`
- `openclaw codex clean`
  - 实现：`src/cli/codex-clean.ts`、`src/cli/codex-cli.ts`
  - 文档：`docs/cli/codex.md`

更完整的初始化设计说明见 `docs/local-init-commands.md`。

## 路径注意点

macOS / Linux 可以使用：

```bash
OPENCLAW_STATE_DIR=/Users/name/openclaw-state
OPENCLAW_CONFIG_PATH=/Users/name/openclaw-config/openclaw.runtime.json5
```

Windows 不能直接复制 macOS 路径，应使用：

```bash
OPENCLAW_STATE_DIR=%USERPROFILE%\openclaw-state
OPENCLAW_CONFIG_PATH=%USERPROFILE%\openclaw-config\openclaw.runtime.json5
```

## 安全要求

- `.env` 可以保存真实 token，但不得提交。
- `openclaw.json` / `openclaw.runtime.json5` 优先保存 env SecretRef，不保存真实 token。
- `openclaw env token --print` 只在明确需要复制 token 时使用。
- `openclaw codex clean` 只清 OpenClaw 侧 Codex 绑定，不删除其它 provider 认证。
- 不提交真实手机号、视频、账号 token、生产配置路径。
