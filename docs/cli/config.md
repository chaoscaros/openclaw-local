---
summary: "`openclaw config` CLI 说明：init/get/set/unset/file/schema/validate"
read_when:
  - 需要用非交互方式读取或修改配置
title: "config"
---

# `openclaw config`

用于非交互修改 `openclaw.json` 的配置辅助命令。支持按路径执行 init/get/set/unset/file/schema/validate，也可以打印当前生效的配置文件路径。不带子命令运行时，会打开配置向导，等同于 `openclaw configure`。

根选项：

- `--section <section>`：不带子命令运行 `openclaw config` 时，用于筛选配置向导章节；可重复传入

支持的向导章节：

- `workspace`
- `model`
- `web`
- `gateway`
- `daemon`
- `channels`
- `plugins`
- `skills`
- `health`

## 示例

```bash
openclaw config file
openclaw config --section model
openclaw config --section gateway --section daemon
openclaw config init
openclaw config schema
openclaw config get browser.executablePath
openclaw config set browser.executablePath "/usr/bin/google-chrome"
openclaw config set agents.defaults.heartbeat.every "2h"
openclaw config set agents.list[0].tools.exec.node "node-id-or-name"
openclaw config set channels.discord.token --ref-provider default --ref-source env --ref-id DISCORD_BOT_TOKEN
openclaw config set secrets.providers.vaultfile --provider-source file --provider-path /etc/openclaw/secrets.json --provider-mode json
openclaw config unset plugins.entries.brave.config.webSearch.apiKey
openclaw config set channels.discord.token --ref-provider default --ref-source env --ref-id DISCORD_BOT_TOKEN --dry-run
openclaw config validate
openclaw config validate --json
```

### `config init`

根据 `~/.openclaw/.env` 里的 `OPENCLAW_CONFIG_PATH` 创建配置文件。

请在执行 `openclaw env init` 并编辑好 `.env` 后使用：

```bash
openclaw env init
# 手动编辑 ~/.openclaw/.env，填好 OPENCLAW_STATE_DIR 和 OPENCLAW_CONFIG_PATH
openclaw config init
```

行为：

- 读取 `~/.openclaw/.env`
- 要求存在 `OPENCLAW_STATE_DIR` 和 `OPENCLAW_CONFIG_PATH`
- 递归创建状态目录和配置文件父目录
- 写入 Gateway 认证配置，并通过 env SecretRef 引用 `OPENCLAW_GATEWAY_TOKEN`
- 默认不覆盖已有配置，除非传入 `--force`
- Windows 上会拒绝复制来的 macOS/Linux home 路径，例如 `/Users/...`

示例：

```bash
openclaw config init
openclaw config init --force
```

### `config schema`

将生成后的 `openclaw.json` JSON schema 以 JSON 形式输出到标准输出。

包含内容：

- 当前根配置 schema，并为编辑器工具补充根级 `$schema` 字符串字段
- Control UI 使用的字段 `title` 和 `description` 文档元数据
- 当存在匹配字段文档时，嵌套对象、通配符（`*`）和数组项（`[]`）节点会继承相同的 `title` / `description` 元数据
- 当存在匹配字段文档时，`anyOf` / `oneOf` / `allOf` 分支也会继承相同文档元数据
- 如果运行时 manifest 可加载，会尽力合入实时插件和渠道 schema 元数据
- 即使当前配置无效，也会输出干净的兜底 schema

相关运行时 RPC：

- `config.schema.lookup` 返回一个规范化配置路径、浅层 schema 节点（`title`、`description`、`type`、`enum`、`const`、常见边界）、匹配的 UI hint 元数据，以及直接子节点摘要。Control UI 或自定义客户端可以用它做按路径钻取。

```bash
openclaw config schema
```

如果需要用其它工具检查或验证，可以重定向到文件：

```bash
openclaw config schema > openclaw.schema.json
```

### 路径

路径支持点号或方括号写法：

```bash
openclaw config get agents.defaults.workspace
openclaw config get agents.list[0].id
```

可以用智能体列表下标定位某个智能体：

```bash
openclaw config get agents.list
openclaw config set agents.list[1].tools.exec.node "node-id-or-name"
```

## 值

值会尽量按 JSON5 解析；无法解析时会按字符串处理。使用 `--strict-json` 可要求必须按 JSON5 解析。`--json` 仍作为旧别名保留。

```bash
openclaw config set agents.defaults.heartbeat.every "0m"
openclaw config set gateway.port 19001 --strict-json
openclaw config set channels.whatsapp.groups '["*"]' --strict-json
```

`config get <path> --json` 会以 JSON 输出原始值，而不是终端格式化文本。

## `config set` 写入模式

`openclaw config set` 支持四种赋值方式：

1. 值模式：`openclaw config set <path> <value>`
2. SecretRef 构建模式：

```bash
openclaw config set channels.discord.token \
  --ref-provider default \
  --ref-source env \
  --ref-id DISCORD_BOT_TOKEN
```

3. Provider 构建模式（只适用于 `secrets.providers.<alias>` 路径）：

```bash
openclaw config set secrets.providers.vault \
  --provider-source exec \
  --provider-command /usr/local/bin/openclaw-vault \
  --provider-arg read \
  --provider-arg openai/api-key \
  --provider-timeout-ms 5000
```

4. 批量模式（`--batch-json` 或 `--batch-file`）：

```bash
openclaw config set --batch-json '[
  {
    "path": "secrets.providers.default",
    "provider": { "source": "env" }
  },
  {
    "path": "channels.discord.token",
    "ref": { "source": "env", "provider": "default", "id": "DISCORD_BOT_TOKEN" }
  }
]'
```

```bash
openclaw config set --batch-file ./config-set.batch.json --dry-run
```

策略说明：

- 不支持 SecretRef 的运行时可变配置面会拒绝 SecretRef 赋值，例如 `hooks.token`、`commands.ownerDisplaySecret`、Discord thread-binding webhook token、WhatsApp creds JSON。参考 [SecretRef Credential Surface](/reference/secretref-credential-surface)。

批量解析始终以批量载荷（`--batch-json` / `--batch-file`）为准。`--strict-json` / `--json` 不会改变批量解析行为。

SecretRef 和 provider 仍支持 JSON 路径/值模式：

```bash
openclaw config set channels.discord.token \
  '{"source":"env","provider":"default","id":"DISCORD_BOT_TOKEN"}' \
  --strict-json

openclaw config set secrets.providers.vaultfile \
  '{"source":"file","path":"/etc/openclaw/secrets.json","mode":"json"}' \
  --strict-json
```

## Provider 构建参数

Provider 构建模式的目标路径必须是 `secrets.providers.<alias>`。

通用参数：

- `--provider-source <env|file|exec>`
- `--provider-timeout-ms <ms>`（适用于 `file`、`exec`）

Env provider（`--provider-source env`）：

- `--provider-allowlist <ENV_VAR>`（可重复）

File provider（`--provider-source file`）：

- `--provider-path <path>`（必填）
- `--provider-mode <singleValue|json>`
- `--provider-max-bytes <bytes>`

Exec provider（`--provider-source exec`）：

- `--provider-command <path>`（必填）
- `--provider-arg <arg>`（可重复）
- `--provider-no-output-timeout-ms <ms>`
- `--provider-max-output-bytes <bytes>`
- `--provider-json-only`
- `--provider-env <KEY=VALUE>`（可重复）
- `--provider-pass-env <ENV_VAR>`（可重复）
- `--provider-trusted-dir <path>`（可重复）
- `--provider-allow-insecure-path`
- `--provider-allow-symlink-command`

加固版 exec provider 示例：

```bash
openclaw config set secrets.providers.vault \
  --provider-source exec \
  --provider-command /usr/local/bin/openclaw-vault \
  --provider-arg read \
  --provider-arg openai/api-key \
  --provider-json-only \
  --provider-pass-env VAULT_TOKEN \
  --provider-trusted-dir /usr/local/bin \
  --provider-timeout-ms 5000
```

## Dry run

使用 `--dry-run` 可以在不写入 `openclaw.json` 的情况下验证改动。

```bash
openclaw config set channels.discord.token \
  --ref-provider default \
  --ref-source env \
  --ref-id DISCORD_BOT_TOKEN \
  --dry-run

openclaw config set channels.discord.token \
  --ref-provider default \
  --ref-source env \
  --ref-id DISCORD_BOT_TOKEN \
  --dry-run \
  --json

openclaw config set channels.discord.token \
  --ref-provider vault \
  --ref-source exec \
  --ref-id discord/token \
  --dry-run \
  --allow-exec
```

Dry-run 行为：

- 构建模式：对变更的 refs/providers 执行 SecretRef 可解析性检查。
- JSON 模式（`--strict-json`、`--json` 或批量模式）：执行 schema 验证和 SecretRef 可解析性检查。
- 已知不支持 SecretRef 的目标配置面也会执行策略验证。
- 策略检查会评估变更后的完整配置，因此父对象写入（例如把 `hooks` 设为对象）不能绕过不支持配置面的验证。
- dry-run 默认跳过 exec SecretRef 检查，避免命令副作用。
- 如需检查 exec SecretRef，可在 `--dry-run` 中传入 `--allow-exec`（这可能执行 provider 命令）。
- `--allow-exec` 只能配合 dry-run 使用；不带 `--dry-run` 会报错。

`--dry-run --json` 会输出机器可读报告：

- `ok`：dry-run 是否通过
- `operations`：评估的赋值操作数量
- `checks`：是否执行 schema / 可解析性检查
- `checks.resolvabilityComplete`：可解析性检查是否完整执行（跳过 exec refs 时为 false）
- `refsChecked`：dry-run 中实际解析的 refs 数量
- `skippedExecRefs`：由于未设置 `--allow-exec` 而跳过的 exec refs 数量
- `errors`：当 `ok=false` 时输出结构化 schema / 可解析性错误

### JSON 输出结构

```json5
{
  ok: boolean,
  operations: number,
  configPath: string,
  inputModes: ["value" | "json" | "builder", ...],
  checks: {
    schema: boolean,
    resolvability: boolean,
    resolvabilityComplete: boolean,
  },
  refsChecked: number,
  skippedExecRefs: number,
  errors?: [
    {
      kind: "schema" | "resolvability",
      message: string,
      ref?: string, // 可解析性错误时存在
    },
  ],
}
```

成功示例：

```json
{
  "ok": true,
  "operations": 1,
  "configPath": "~/.openclaw/openclaw.json",
  "inputModes": ["builder"],
  "checks": {
    "schema": false,
    "resolvability": true,
    "resolvabilityComplete": true
  },
  "refsChecked": 1,
  "skippedExecRefs": 0
}
```

失败示例：

```json
{
  "ok": false,
  "operations": 1,
  "configPath": "~/.openclaw/openclaw.json",
  "inputModes": ["builder"],
  "checks": {
    "schema": false,
    "resolvability": true,
    "resolvabilityComplete": true
  },
  "refsChecked": 1,
  "skippedExecRefs": 0,
  "errors": [
    {
      "kind": "resolvability",
      "message": "Error: Environment variable \"MISSING_TEST_SECRET\" is not set.",
      "ref": "env:default:MISSING_TEST_SECRET"
    }
  ]
}
```

如果 dry-run 失败：

- `config schema validation failed`：变更后的配置形状无效；需要修正路径/值或 provider/ref 对象结构。
- `Config policy validation failed: unsupported SecretRef usage`：该凭据目标不支持 SecretRef；改回明文/字符串输入，并只在支持的配置面使用 SecretRef。
- `SecretRef assignment(s) could not be resolved`：引用的 provider/ref 当前无法解析，可能是 env 缺失、文件指针无效、exec provider 失败或 provider/source 不匹配。
- `Dry run note: skipped <n> exec SecretRef resolvability check(s)`：dry-run 跳过了 exec refs；如需验证 exec 可解析性，请加 `--allow-exec` 重新运行。
- 批量模式下，先修正失败项，再重新运行 `--dry-run`，确认通过后再写入。

## 子命令

- `config file`：打印当前生效的配置文件路径（来自 `OPENCLAW_CONFIG_PATH` 或默认位置）。

修改配置后需要重启 gateway。

## 验证

在不启动 gateway 的情况下，用当前生效 schema 验证当前配置。

```bash
openclaw config validate
openclaw config validate --json
```
