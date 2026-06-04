# 本地验证说明

## 基础验证

常用本地 gate：

```bash
OPENCLAW_LOCAL_CHECK=0 pnpm lint
OPENCLAW_LOCAL_CHECK=0 pnpm tsgo:core
OPENCLAW_LOCAL_CHECK=0 pnpm tsgo:extensions
OPENCLAW_LOCAL_CHECK=0 pnpm tsgo:test:ui
```

完整构建：

```bash
OPENCLAW_LOCAL_CHECK=0 pnpm build
```

只改文档时，通常跑：

```bash
git diff --check -- <file...>
```

## UI 构建

改了 `ui/`、Control UI 资源、任务模式界面、移动端布局时，通常需要：

```bash
pnpm ui:build
```

如果服务已启动但显示 `Control UI assets not found`，先构建 UI，再由用户重启服务。

## 任务模式定向测试

```bash
OPENCLAW_LOCAL_CHECK=0 pnpm test src/gateway/task-mode-store.test.ts src/gateway/server-methods/tasks.test.ts ui/src/ui/controllers/tasks.test.ts ui/src/ui/views/tasks.test.ts ui/src/ui/views/sessions.task-mode.test.ts ui/src/ui/app-chat.task-mode.test.ts ui/src/ui/app-render.helpers.task-context.test.ts
```

## Memory / Dreaming 定向测试

```bash
OPENCLAW_LOCAL_CHECK=0 pnpm test extensions/memory-core/src/dreaming.test.ts extensions/memory-core/src/short-term-promotion.test.ts
```

## Gateway / protocol / attachment 定向测试

```bash
OPENCLAW_LOCAL_CHECK=0 pnpm test src/gateway/managed-image-attachments.test.ts src/gateway/protocol/talk-config.contract.test.ts src/gateway/chat-attachments.test.ts src/gateway/reconnect-gating.test.ts src/gateway/protocol/native-protocol-levels.guard.test.ts
```

## 依赖和生成物漂移

```bash
pnpm deps:shrinkwrap:changed:check
pnpm config:docs:check
pnpm plugin-sdk:api:check
```

如果改了某个 plugin 的依赖，优先跑对应 plugin 的 shrinkwrap 检查。

## 收尾检查

收尾前至少确认：

- 当前分支是预期分支。
- `git status` 中没有混入不相关改动。
- 已运行与本次改动面直接相关的验证。
- 如果改动影响构建产物、动态 import、发布表面或 UI 资源，`pnpm build` 必须通过。
- 用户负责重启服务时，只说明需要重启，不代替用户启动后台进程。

## 浏览器验收

用户已启动服务并打开浏览器时，可以直接验收：

- 桌面端维持用户当前窗口尺寸，不擅自缩小窗口。
- 移动端需要用户切换设备模拟尺寸后再验收。
- 重点看任务模式、顶部工具栏、错误提示、消息发送、归档/任务页面是否退化。
