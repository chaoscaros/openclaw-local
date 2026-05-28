import { describe, expect, test, vi } from "vitest";
import { buildSessionHistorySnapshot, SessionHistorySseState } from "./session-history-state.js";
import * as sessionUtils from "./session-utils.js";

describe("SessionHistorySseState", () => {
  test("uses the initial raw snapshot for both first history and seq seeding", () => {
    const readSpy = vi.spyOn(sessionUtils, "readSessionMessages").mockReturnValue([
      {
        role: "assistant",
        content: [{ type: "text", text: "stale disk message" }],
        __openclaw: { seq: 1 },
      },
    ]);
    try {
      const state = SessionHistorySseState.fromRawSnapshot({
        target: { sessionId: "sess-main" },
        rawMessages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "fresh snapshot message" }],
            __openclaw: { seq: 2 },
          },
        ],
      });

      expect(state.snapshot().messages).toHaveLength(1);
      expect(
        (
          state.snapshot().messages[0] as {
            content?: Array<{ text?: string }>;
            __openclaw?: { seq?: number };
          }
        ).content?.[0]?.text,
      ).toBe("fresh snapshot message");
      expect(
        (
          state.snapshot().messages[0] as {
            __openclaw?: { seq?: number };
          }
        ).__openclaw?.seq,
      ).toBe(2);

      const appended = state.appendInlineMessage({
        message: {
          role: "assistant",
          content: [{ type: "text", text: "next message" }],
        },
      });

      expect(appended?.messageSeq).toBe(3);
      expect(readSpy).not.toHaveBeenCalled();
    } finally {
      readSpy.mockRestore();
    }
  });

  test("reuses one canonical array for items and messages", () => {
    const snapshot = buildSessionHistorySnapshot({
      rawMessages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "first" }],
          __openclaw: { seq: 1 },
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "second" }],
          __openclaw: { seq: 2 },
        },
      ],
      limit: 1,
    });

    expect(snapshot.history.items).toBe(snapshot.history.messages);
    expect(snapshot.history.messages[0]?.__openclaw?.seq).toBe(2);
    expect(snapshot.rawTranscriptSeq).toBe(2);
  });

  test("drops hidden runtime-context custom messages from projected history", () => {
    const snapshot = buildSessionHistorySnapshot({
      rawMessages: [
        {
          role: "custom",
          customType: "openclaw.runtime-context",
          content: "secret runtime context",
          display: false,
          __openclaw: { seq: 1 },
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "visible answer" }],
          __openclaw: { seq: 2 },
        },
      ],
    });

    expect(snapshot.history.messages).toEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "visible answer" }],
        __openclaw: { seq: 2 },
      },
    ]);
    expect(snapshot.rawTranscriptSeq).toBe(2);
  });

  test("strips task binding metadata from projected user history", () => {
    const snapshot = buildSessionHistorySnapshot({
      rawMessages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `[Current task binding for this turn]
Task id: task-1
Task title: supply_vue项目
Task summary: /path/to/project
Use the task binding above as the task the user is continuing right now.
If earlier conversation history mentions different tasks, treat those as stale unless the user explicitly switches again.

[Wed 2026-05-27 17:19 GMT+8] 配送金额 和 退货金额 是表格里已有的字段`,
            },
          ],
          __openclaw: { seq: 1 },
        },
      ],
    });

    expect(snapshot.history.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "配送金额 和 退货金额 是表格里已有的字段",
          },
        ],
        __openclaw: { seq: 1 },
      },
    ]);
  });

  test("drops hidden inline messages while preserving raw sequence", () => {
    const state = SessionHistorySseState.fromRawSnapshot({
      target: { sessionId: "sess-main" },
      rawMessages: [],
    });

    expect(
      state.appendInlineMessage({
        message: {
          role: "custom",
          customType: "openclaw.runtime-context",
          content: "secret runtime context",
          display: false,
        },
      }),
    ).toBeNull();

    const appended = state.appendInlineMessage({
      message: {
        role: "assistant",
        content: [{ type: "text", text: "visible answer" }],
      },
    });

    expect(appended?.messageSeq).toBe(2);
    expect(state.snapshot().messages).toHaveLength(1);
  });
});
