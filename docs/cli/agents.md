---
summary: "`openclaw agents` CLI 说明：初始化、列表、增删、绑定和身份设置"
read_when:
  - 需要多个隔离智能体（工作区、路由、认证）
title: "agents"
---

# `openclaw agents`

管理隔离智能体，包括工作区、认证和消息路由。

相关文档：

- 多智能体路由：[Multi-Agent Routing](/concepts/multi-agent)
- 智能体工作区：[Agent workspace](/concepts/agent-workspace)
- 技能可见性配置：[Skills config](/tools/skills-config)

## 示例

```bash
openclaw agents list
openclaw agents init
openclaw agents list --bindings
openclaw agents add work --workspace ~/.openclaw/workspace-work
openclaw agents add ops --workspace ~/.openclaw/workspace-ops --bind telegram:ops --non-interactive
openclaw agents bindings
openclaw agents bind --agent work --bind telegram:ops
openclaw agents unbind --agent work --bind telegram:ops
openclaw agents set-identity --workspace ~/.openclaw/workspace --from-identity
openclaw agents set-identity --agent main --avatar avatars/openclaw.png
openclaw agents delete work
```

## 路由绑定

路由绑定用于把某个渠道的入站消息固定分配给指定智能体。

如果还需要为不同智能体配置不同可见技能，可以在 `openclaw.json` 里配置 `agents.defaults.skills` 和 `agents.list[].skills`。参考 [Skills config](/tools/skills-config) 和 [Configuration Reference](/gateway/configuration-reference#agents-defaults-skills)。

列出绑定：

```bash
openclaw agents bindings
openclaw agents bindings --agent work
openclaw agents bindings --json
```

添加绑定：

```bash
openclaw agents bind --agent work --bind telegram:ops --bind discord:guild-a
```

如果省略 `accountId`（即使用 `--bind <channel>`），OpenClaw 会尽量从渠道默认账号和插件 setup hook 中解析。

如果执行 `bind` 或 `unbind` 时省略 `--agent`，OpenClaw 会使用当前默认智能体。

### 绑定作用域

- 不带 `accountId` 的绑定只匹配渠道默认账号。
- `accountId: "*"` 表示渠道级兜底（所有账号），优先级低于显式账号绑定。
- 如果同一个智能体已经有不带 `accountId` 的渠道绑定，后续再绑定显式或解析出的 `accountId`，OpenClaw 会原地升级已有绑定，而不是新增重复项。

示例：

```bash
# 初始渠道绑定
openclaw agents bind --agent work --bind telegram

# 后续升级为账号级绑定
openclaw agents bind --agent work --bind telegram:ops
```

升级后，该绑定只路由到 `telegram:ops`。如果还需要默认账号路由，需要显式添加，例如 `--bind telegram:default`。

移除绑定：

```bash
openclaw agents unbind --agent work --bind telegram:ops
openclaw agents unbind --agent work --all
```

`unbind` 可以使用 `--all`，也可以传一个或多个 `--bind`，但不能同时使用。

## 命令入口

### `agents`

不带子命令运行 `openclaw agents` 等同于 `openclaw agents list`。

### `agents init`

根据 `openclaw env init` 和 `openclaw config init` 生成的 `.env` 与配置文件，创建或更新本地默认 `solo` 智能体。

行为：

- 读取 `~/.openclaw/.env`
- 要求存在 `OPENCLAW_STATE_DIR` 和 `OPENCLAW_CONFIG_PATH`
- 读取 `OPENCLAW_CONFIG_PATH` 指向的配置文件
- 递归创建智能体状态目录和会话目录
- 将 `solo` 设为默认智能体
- 使用当前工作目录作为 `solo` 工作区
- 默认保留已有 `solo` 智能体，除非传入 `--force`

示例：

```bash
openclaw agents init
openclaw agents init --force
```

### `agents list`

选项：

- `--json`
- `--bindings`：包含完整路由规则，而不是只显示每个智能体的数量/摘要

### `agents add [name]`

选项：

- `--workspace <dir>`
- `--model <id>`
- `--agent-dir <dir>`
- `--bind <channel[:accountId]>`（可重复）
- `--non-interactive`
- `--json`

说明：

- 传入任何显式 add 选项都会进入非交互路径。
- 非交互模式要求同时提供智能体名称和 `--workspace`。
- `main` 是保留 id，不能作为新智能体 id。

### `agents bindings`

选项：

- `--agent <id>`
- `--json`

### `agents bind`

选项：

- `--agent <id>`（默认使用当前默认智能体）
- `--bind <channel[:accountId]>`（可重复）
- `--json`

### `agents unbind`

选项：

- `--agent <id>`（默认使用当前默认智能体）
- `--bind <channel[:accountId]>`（可重复）
- `--all`
- `--json`

### `agents delete <id>`

选项：

- `--force`
- `--json`

说明：

- `main` 不能删除。
- 不传 `--force` 时需要交互确认。
- 工作区、智能体状态和会话 transcript 目录会移到废纸篓，不会直接硬删除。

## 身份文件

每个智能体工作区根目录都可以包含一个 `IDENTITY.md`：

- 示例路径：`~/.openclaw/workspace/IDENTITY.md`
- `set-identity --from-identity` 会从工作区根目录读取，也可以通过 `--identity-file` 显式指定

头像路径按工作区根目录解析。

## 设置身份

`set-identity` 会写入 `agents.list[].identity` 字段：

- `name`
- `theme`
- `emoji`
- `avatar`（工作区相对路径、http(s) URL 或 data URI）

选项：

- `--agent <id>`
- `--workspace <dir>`
- `--identity-file <path>`
- `--from-identity`
- `--name <name>`
- `--theme <theme>`
- `--emoji <emoji>`
- `--avatar <value>`
- `--json`

说明：

- 可以用 `--agent` 或 `--workspace` 选择目标智能体。
- 如果多个智能体共享同一个工作区，而你只传 `--workspace`，命令会失败并要求改传 `--agent`。
- 如果没有提供显式身份字段，命令会从 `IDENTITY.md` 读取身份数据。

从 `IDENTITY.md` 读取：

```bash
openclaw agents set-identity --workspace ~/.openclaw/workspace --from-identity
```

显式覆盖字段：

```bash
openclaw agents set-identity --agent main --name "OpenClaw" --emoji "🦞" --avatar avatars/openclaw.png
```

配置示例：

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "OpenClaw",
          theme: "space lobster",
          emoji: "🦞",
          avatar: "avatars/openclaw.png",
        },
      },
    ],
  },
}
```
