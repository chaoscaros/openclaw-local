# OpenClaw Local

这是我自己的本地改版 OpenClaw 项目，不是官方仓库说明文档。

## 项目定位

这个项目基于 OpenClaw `v2026.4.14` 本地复制出来，作为我自己的长期本地改版版本使用。

目标是：

- 保留官方 OpenClaw 仓库原样，方便后续同步和参考
- 在这个项目里持续做我自己的本地优化和定制
- 将我常用的默认技能、交互体验优化、界面调整一起固化下来

当前项目为本地长期维护版本。

Git 仓库：

```bash
git@github.com:chaoscaros/openclaw-local.git
```

## 和官方仓库的关系

官方仓库保留为上游参考版本，不作为我的日常改版仓库。

我自己的改动只放在当前这个本地 fork 项目中。

这样做的好处：

- 官方仓库保持干净
- 本地改版和官方版本职责分离
- 后续要对比、挑改动、同步上游会更清晰

## 当前已内置的本地定制

### 1. Chat 发送体验优化

已包含一批针对聊天区交互体验的本地优化：

- 优化发送后首包前的 loading 表现
- 降低发送中消息闪烁、消失、被旧 history 覆盖的概率
- 调整 loading 气泡样式，让它更自然
- 避免运行中的状态被不必要的 history reload 打断

### 2. 默认技能：dev-spec-first

本项目已内置并默认启用 `dev-spec-first` 技能。

作用：

- 默认先整理规格，不直接改代码
- 只有在用户明确说“直接开发 / 应用修改 / 直接改代码”时才进入开发模式
- 用来约束需求分析和开发边界，减少误改和过度执行

当前项目内技能位于项目内的 `.agents/skills/dev-spec-first`。

如需扩展技能，可通过项目内 skills 目录或配置里的额外 skills 目录接入。

### 3. 项目默认配置

项目根目录包含本地配置文件 `openclaw.json`。

目前已配置：

- 默认 agent workspace 指向当前项目目录
- 默认启用 `dev-spec-first`
- 额外扫描外部 skills 目录

## 启动方式

在项目目录下运行：

```bash
pnpm install
pnpm build
pnpm fast
```

如果依赖已经安装过，通常只需要：

```bash
pnpm fast
```

## 常用开发命令

### 查看 Git 状态

```bash
git status
```

### 提交改动

```bash
git add .
git commit -m "你的提交说明"
git push
```

### 运行定向测试

例如 UI/chat 相关测试：

```bash
pnpm vitest run ui/src/ui/views/chat.test.ts ui/src/ui/app-chat.test.ts ui/src/ui/controllers/chat.test.ts ui/src/ui/app-gateway.sessions.node.test.ts
```

## README 使用原则

这个 README 代表的是**我自己的本地版本说明**，不是官方 OpenClaw 的总说明。

所以这里应该优先记录：

- 这个本地版本是干什么的
- 和官方仓库怎么分工
- 我自己加了哪些本地定制
- 我平时怎么启动、怎么维护、怎么提交

而不是照搬官方 README 的完整介绍。

## 后续建议

后面可以继续补充这些内容：

- 我的本地定制清单
- 默认技能说明
- 常见问题排查记录
- 与官方版本同步的流程
- 本地 UI / 交互改动的说明

---

如果后续这个项目继续长期维护，这份 README 应该持续按“我的本地版本说明”方向演进。