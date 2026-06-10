# 功能保护点

这些是本地 fork 在后续迭代里需要持续保护的功能面。

## 任务模式

任务模式是本地版本的核心功能之一，不能在 tag 吸收时跳过。

重点保护：

- 顶部任务绑定和当前任务入口。
- 任务中心、任务详情、任务上下文。
- 会话与任务绑定后的协作上下文。
- 普通对话和任务模式必须分离；切回普通对话后不能继续注入当前任务上下文。
- 移动端任务模式入口和控制项。
- 任务切换、归档、已完成状态展示。
- 任务切过去后不能自动消失。
- 任务、归档、发送消息不能因为 gateway method 不匹配而空白。

改动涉及 gateway、session、chat、Control UI、mobile layout 时，都要顺手验收任务模式。

## Memory / Dreaming

Dreaming 和 memory-core 曾单独改过，后续迭代需要注意：

- short-term memory promotion。
- dreaming / REM 处理。
- memory budget 保护。
- 防止 promotion 把 `MEMORY.md` 写得过大。
- 与任务上下文、会话摘要、长期记忆的协同。

涉及 `extensions/memory-core` 或 memory 相关配置时，优先跑 dreaming 定向测试。

## Control UI

Control UI 是本地主要使用界面。

重点保护：

- 聊天、任务、归档、会话、日志、使用情况等导航入口。
- 桌面端顶部工具栏不要被错误提示挤压变形。
- 移动端任务模式和设置入口要可用。
- 自动滚动模式、工具状态、错误状态要清晰。
- 工具错误不要重复显示造成布局异常。
- UI 构建产物缺失时要给出明确提示。

## Gateway / Runtime

重点保护：

- session reset 与 CLI session 绑定清理。
- task mode store 配置读取。
- native protocol level 对齐。
- reconnect gating。
- 图片附件大小保护。
- runtime config 读取边界。
- 临时路径和过期配置 API guard。
- shrinkwrap 与 plugin SDK 入口校验。
- `pnpm fast` 是本地常用启动入口，必须保留 `scripts/fast-gateway.mjs`，并确保 Windows 下 `Ctrl+C` 能停止 gateway 子进程树。
- Codex native hook relay 必须按 run 隔离，避免 PreToolUse 阶段出现 `Native hook relay unavailable` 后阻断 `exec_command`、`python3` 等本地命令。
- Codex native hook relay 不可用时，PermissionRequest 不能直接 fail-closed 阻断 `apply_patch` 或写文件工具；应静默让 Codex 原生授权路径接管。
- 禁用 Codex native hook relay 时，必须同时清空 hook 列表并把 `hooks.state` 标记为 disabled，避免旧会话残留的信任状态继续触发本地 hook。
- `extensions/codex` 单测必须路由到 Codex extension Vitest lane，不能出现 `pnpm test extensions/codex/...` 看似运行但实际跳过的情况。
- 涉及 Codex app-server、Gateway 协议或 Control UI 构建时，必须确认 `dist/build-info.json` 指向当前提交；如果服务已启动在旧构建上，需要重新构建并由用户重启后再验收。

如果出现 `protocol mismatch`、`unknown method`、`invalid chat.send params` 等错误，先判断是 UI 和 gateway 版本不一致，还是协议/schema 没同步。

## Android / 移动端

Android 当前主要关注移动 UI 和打包能力。

注意点：

- Android 不是 supply_vue 业务 app，而是 OpenClaw 本身的移动端/原生相关能力。
- 本地 Java Runtime 或 Android SDK 可能缺失；如果需要 Android 专项验证，先确认环境。
- 移动端任务模式入口、设置面板、顶部控制项要单独验收。

## 本地默认技能

默认启用 `dev-spec-first`：

- 默认先整理规格，不直接改代码。
- 用户明确说“直接开发 / 应用修改 / 直接改代码”时，再进入实现。
- 这个默认技能在 `openclaw.json` 中配置。
