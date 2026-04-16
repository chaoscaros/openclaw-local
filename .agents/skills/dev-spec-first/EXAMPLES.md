# dev-spec-first 调用示例

---

## 示例 1：截图 + 文件路径（最常见）

**用户输入：**
> [截图] 把这个分类区域改成下拉框
> 文件：`/project/src/views/index/index.vue`
> 参考：`/Downloads/index.html`

**Skill 默认输出（规格模式）：**

```
## 开发 Prompt

### 任务描述
将 index.vue 上半部分卡片区的分类分段按钮，改为单个下拉选择框，
放在搜索框右侧，默认值为"全部"，复用原有分类筛选逻辑。

### 文件路径
- 目标文件：`/project/src/views/index/index.vue`
- 目标样式：`/project/src/views/index/index.scss`
- 参考文件：`/Downloads/index.html`（参考 .p2-search / .p2-sort 样式）

### 改动范围
只允许修改：
1. index.vue 中 `.p2-search` 内分类区域 template
2. index.scss 中分类控件对应样式
3. 极少量 data/computed/method 适配（categorySelectValue、onCategorySelectChange）

### 禁改区域
不允许修改：
1. header 顶部绿色栏
2. 左侧商品列表栏
3. 卡片列表其他布局
4. 下半部分详情区
5. filterByCategory / filterByThirdCategory 方法内部逻辑
6. 接口请求

### 复用要求
必须复用：
1. filterByCategory(id) 方法
2. orderCategoryList computed（已过滤当前订单有的分类）
3. selectedCategoryId 数据字段

### 实现约束
- Vue2，禁用 ?. ?? <script setup>
- 使用已注册的 el-select / el-option，不引入新组件
- 不整页重写

### 验收标准
- ✅ 原分段按钮消失
- ✅ 搜索框右侧出现下拉框，默认"全部"
- ✅ 选择分类后商品列表按原逻辑筛选
- ❌ 非分类区域不变
```

> 📋 规格已就绪。如需执行，请说"**直接开发**"或"**应用修改**"。

---

**用户回复：**
> 直接开发

**Skill 切换到 Dev Mode：**
> 好的，进入开发模式，开始读取文件...（然后真正执行修改）

---

## 示例 2：自然语言需求 + 多轮补充

**第一轮：**
> 帮我把打印按钮改成先弹出数量弹窗

**Skill 输出（需要一个关键问题）：**
> 打印按钮在哪个文件？可以提供路径或截图吗？

**第二轮：**
> `/project/src/views/index/index.vue`，原来的打印方法叫 go_print

**Skill 输出规格（不动代码）**

---

## 示例 3：要求转给 ACP Harness

**用户输入：**
> 用 Codex 帮我实现这个

**Skill 行为：**
1. 先整理规格（如果还没有）
2. 将规格 prompt 适配为 Codex 输入格式
3. 通过 sessions_spawn 发送

---

## 示例 4：要求手动应用

**用户输入：**
> 给我代码片段，我自己改

**Skill 行为：**
- 不动文件
- 输出精确的"替换前 → 替换后"代码块
- 标注每个片段对应的文件和大概行号

---

## 快速触发方式

| 我说的话 | Skill 行为 |
|---|---|
| "帮我改 XXX" | 输出规格 prompt，不动代码 |
| "我想让 XXX 变成 YYY" | 输出规格 prompt，不动代码 |
| "直接开发" | 读文件，执行修改 |
| "直接改代码" | 读文件，执行修改 |
| "应用修改" | 读文件，执行修改 |
| "给我代码片段" | 输出代码块，不动文件 |
| "用 Codex 做" | 适配规格，发给 Codex |
| "调整规格，加一条：禁止改 XXX" | 更新规格中禁改区域 |
