import type { TemplateResult } from "lit";
import { icons } from "../icons.ts";
import type { CronFormState } from "../ui-types.ts";

export type CronTemplateCategory = "statusReports" | "releasePrep" | "incidents" | "maintenance";

export type CronTemplateRiskLevel = "safe" | "review";

export type CronTemplateDefinition = {
  id: string;
  category: CronTemplateCategory;
  icon: TemplateResult;
  title: string;
  description: string;
  riskLabel: string;
  riskLevel: CronTemplateRiskLevel;
  scheduleSummary: string;
  deliverySummary: string;
  outputSummary: string;
  tags?: string[];
  defaultFormPatch: Partial<CronFormState>;
};

export type CronTemplateGroup = {
  id: CronTemplateCategory;
  title: string;
  templates: CronTemplateDefinition[];
};

const TEMPLATE_GROUPS: Array<{ id: CronTemplateCategory; title: string }> = [
  { id: "statusReports", title: "状态报告" },
  { id: "releasePrep", title: "发布准备" },
  { id: "incidents", title: "故障分诊" },
  { id: "maintenance", title: "仓库维护" },
];

const TEMPLATE_DEFINITIONS: CronTemplateDefinition[] = [
  {
    id: "daily-git-standup",
    category: "statusReports",
    icon: icons.messageSquare,
    title: "昨日 git 站会总结",
    description: "总结昨天的提交、PR 和关键文件变更，适合晨会同步。",
    riskLabel: "低风险",
    riskLevel: "safe",
    scheduleSummary: "工作日 09:00",
    deliverySummary: "发送到当前频道",
    outputSummary: "晨会摘要",
    tags: ["git", "站会", "日报"],
    defaultFormPatch: {
      name: "昨日 git 站会总结",
      description: "按证据生成昨日开发活动晨会摘要。",
      scheduleKind: "cron",
      cronExpr: "0 9 * * 1-5",
      cronTz: "Asia/Shanghai",
      sessionTarget: "isolated",
      wakeMode: "now",
      payloadKind: "agentTurn",
      payloadText:
        "总结昨天这个仓库里的 git 活动，输出适合站会的简洁摘要。只依据提交、PR、文件路径和可验证记录，不要臆测意图或未来计划。请按：1) 重点进展 2) 风险/阻塞 3) 值得跟进的改动 列出。",
      deliveryMode: "announce",
      deliveryChannel: "last",
      timeoutSeconds: "120",
    },
  },
  {
    id: "weekly-pr-report",
    category: "statusReports",
    icon: icons.fileText,
    title: "每周 PR / 发布周报",
    description: "汇总本周 PR、发布、事故与评审，生成可转发周报草稿。",
    riskLabel: "低风险",
    riskLevel: "safe",
    scheduleSummary: "每周五 17:00",
    deliverySummary: "发送到当前频道",
    outputSummary: "周报草稿",
    tags: ["PR", "周报", "发布"],
    defaultFormPatch: {
      name: "每周 PR / 发布周报",
      description: "生成基于仓库事实的周报草稿。",
      scheduleKind: "cron",
      cronExpr: "0 17 * * 5",
      cronTz: "Asia/Shanghai",
      sessionTarget: "isolated",
      wakeMode: "now",
      payloadKind: "agentTurn",
      payloadText:
        "把本周与该仓库相关的 PR、发布、事故和评审整理成一份周报草稿。优先引用 PR 编号、标题、发布说明、事故 ID、文件路径等具体证据。缺失数据时请明确写出未知，不要虚构事件。",
      deliveryMode: "announce",
      deliveryChannel: "last",
      timeoutSeconds: "180",
    },
  },
  {
    id: "weekly-release-notes",
    category: "releasePrep",
    icon: icons.book,
    title: "Weekly release notes 草稿",
    description: "依据本周已合并 PR 生成发布说明草稿，不自动发版。",
    riskLabel: "需复核",
    riskLevel: "review",
    scheduleSummary: "每周四 15:00",
    deliverySummary: "发送到当前频道",
    outputSummary: "发布说明草稿",
    tags: ["release", "notes", "发布说明"],
    defaultFormPatch: {
      name: "Weekly release notes 草稿",
      description: "基于已合并 PR 生成发布说明草稿。",
      scheduleKind: "cron",
      cronExpr: "0 15 * * 4",
      cronTz: "Asia/Shanghai",
      sessionTarget: "isolated",
      wakeMode: "now",
      payloadKind: "agentTurn",
      payloadText:
        "根据本周已合并的 PR 起草一份 weekly release notes。只包含仓库历史中能支持的条目，尽量附上 PR 编号/标题/链接。如果缺少证据，就写成待确认，不要补写没有依据的影响说明。",
      deliveryMode: "announce",
      deliveryChannel: "last",
      timeoutSeconds: "180",
    },
  },
  {
    id: "release-readiness-check",
    category: "releasePrep",
    icon: icons.checkSquare,
    title: "发布前检查清单",
    description: "核对 changelog、迁移、功能开关和测试状态，输出发布前检查结果。",
    riskLabel: "需复核",
    riskLevel: "review",
    scheduleSummary: "每 7 天",
    deliverySummary: "发送到当前频道",
    outputSummary: "发布检查结果",
    tags: ["release", "checklist", "测试"],
    defaultFormPatch: {
      name: "发布前检查清单",
      description: "输出发布前检查结果，不直接执行发布。",
      scheduleKind: "every",
      everyAmount: "7",
      everyUnit: "days",
      sessionTarget: "isolated",
      wakeMode: "now",
      payloadKind: "agentTurn",
      payloadText:
        "发布前请核对这个仓库的 changelog、迁移、功能开关、测试与明显的发布阻塞项。只报告能从仓库与现有上下文确认的事实；无法验证的项请明确标记为未知。输出格式：已确认 / 需确认 / 风险。",
      deliveryMode: "announce",
      deliveryChannel: "last",
      timeoutSeconds: "180",
    },
  },
  {
    id: "ci-failure-triage",
    category: "incidents",
    icon: icons.loader,
    title: "CI 失败巡检",
    description: "汇总最近失败作业、flaky tests 与首要修复建议。",
    riskLabel: "低风险",
    riskLevel: "safe",
    scheduleSummary: "每 6 小时",
    deliverySummary: "发送到当前频道",
    outputSummary: "失败汇总与修复建议",
    tags: ["CI", "失败", "flaky"],
    defaultFormPatch: {
      name: "CI 失败巡检",
      description: "定期汇总最近 CI 失败与疑似根因。",
      scheduleKind: "every",
      everyAmount: "6",
      everyUnit: "hours",
      sessionTarget: "isolated",
      wakeMode: "now",
      payloadKind: "agentTurn",
      payloadText:
        "总结最近一个 CI 窗口内的失败作业和不稳定测试，给出首要修复建议。尽可能引用具体 job、测试名、错误信息或日志片段。区分已观察到的事实与疑似根因，不要过度自信。",
      deliveryMode: "announce",
      deliveryChannel: "last",
      timeoutSeconds: "180",
    },
  },
  {
    id: "issue-triage-suggestions",
    category: "incidents",
    icon: icons.bug,
    title: "新 issue 分诊建议",
    description: "给出 owner、优先级和标签建议，不明确时标 Unknown。",
    riskLabel: "低风险",
    riskLevel: "safe",
    scheduleSummary: "每 12 小时",
    deliverySummary: "发送到当前频道",
    outputSummary: "分诊建议",
    tags: ["issue", "triage", "owner"],
    defaultFormPatch: {
      name: "新 issue 分诊建议",
      description: "对新问题给出分诊建议。",
      scheduleKind: "every",
      everyAmount: "12",
      everyUnit: "hours",
      sessionTarget: "isolated",
      wakeMode: "now",
      payloadKind: "agentTurn",
      payloadText:
        "分诊近期新增的问题，建议 owner、priority 和 labels。依据 issue 内容、仓库上下文、涉及区域与已有线索给建议。没有明确信号时不要猜负责人；如不明确，请写 Owner: Unknown，并建议一个可能负责的团队。",
      deliveryMode: "announce",
      deliveryChannel: "last",
      timeoutSeconds: "150",
    },
  },
  {
    id: "dependency-drift-check",
    category: "maintenance",
    icon: icons.checkSquare,
    title: "依赖漂移检查",
    description: "检测依赖/SDK 版本漂移，只给出最小对齐建议。",
    riskLabel: "低风险",
    riskLevel: "safe",
    scheduleSummary: "每周一 10:00",
    deliverySummary: "发送到当前频道",
    outputSummary: "版本对齐建议",
    tags: ["依赖", "SDK", "版本"],
    defaultFormPatch: {
      name: "依赖漂移检查",
      description: "输出依赖与 SDK 版本对齐建议。",
      scheduleKind: "cron",
      cronExpr: "0 10 * * 1",
      cronTz: "Asia/Shanghai",
      sessionTarget: "isolated",
      wakeMode: "now",
      payloadKind: "agentTurn",
      payloadText:
        "检测仓库里的依赖项和 SDK 版本漂移，并提出最小对齐方案。尽量引用当前版本、目标版本、锁文件或包清单。不要猜测目标版本；如果目标不明确，请给出候选方案并标注为建议。",
      deliveryMode: "announce",
      deliveryChannel: "last",
      timeoutSeconds: "180",
    },
  },
  {
    id: "agents-doc-suggestions",
    category: "maintenance",
    icon: icons.fileCode,
    title: "AGENTS.md 更新建议",
    description: "根据仓库中新出现的流程与命令生成文档更新草稿。",
    riskLabel: "需复核",
    riskLevel: "review",
    scheduleSummary: "每周三 16:00",
    deliverySummary: "发送到当前频道",
    outputSummary: "文档更新草稿",
    tags: ["AGENTS.md", "文档", "流程"],
    defaultFormPatch: {
      name: "AGENTS.md 更新建议",
      description: "生成 AGENTS.md 的最小更新建议草稿。",
      scheduleKind: "cron",
      cronExpr: "0 16 * * 3",
      cronTz: "Asia/Shanghai",
      sessionTarget: "isolated",
      wakeMode: "now",
      payloadKind: "agentTurn",
      payloadText:
        "根据仓库里最近出现的新工作流、命令或约定，提出对 AGENTS.md 的最小更新建议。只依据仓库中的真实用法和现有文档，不要编造规则。输出为草稿建议，不直接修改文件。",
      deliveryMode: "announce",
      deliveryChannel: "last",
      timeoutSeconds: "150",
    },
  },
];

export function getCronTemplateGroups(): CronTemplateGroup[] {
  return TEMPLATE_GROUPS.map((group) =>
    Object.assign({}, group, {
      templates: TEMPLATE_DEFINITIONS.filter((template) => template.category === group.id),
    }),
  );
}

export function findCronTemplateById(id: string | null | undefined): CronTemplateDefinition | null {
  if (!id) {
    return null;
  }
  return TEMPLATE_DEFINITIONS.find((template) => template.id === id) ?? null;
}

export function filterCronTemplateGroups(options?: {
  query?: string | null;
  risk?: CronTemplateRiskLevel | "all" | null;
}) {
  const query = options?.query?.trim().toLowerCase() ?? "";
  const risk = options?.risk ?? "all";
  return getCronTemplateGroups()
    .map((group) =>
      Object.assign({}, group, {
        templates: group.templates.filter((template) => {
          if (risk !== "all" && template.riskLevel !== risk) {
            return false;
          }
          if (!query) {
            return true;
          }
          const haystack = [
            template.title,
            template.description,
            template.scheduleSummary,
            template.deliverySummary,
            template.outputSummary,
            ...(template.tags ?? []),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        }),
      }),
    )
    .filter((group) => group.templates.length > 0);
}
