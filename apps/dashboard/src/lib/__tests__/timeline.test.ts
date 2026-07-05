import { describe, expect, it } from "vitest";

import type { Event, Message } from "../api/schemas";
import { mergeTimeline, upsertMessage } from "../timeline";

function msg(id: string, createdAt: string): Message {
  return {
    id,
    conversationId: "conv_1",
    role: "visitor",
    authorId: "vis_1",
    content: { type: "text", text: id },
    createdAt,
  };
}

function evt(id: string, createdAt: string): Event {
  return { id, type: "assigned", actor: "user:usr_1", payload: {}, createdAt };
}

describe("mergeTimeline", () => {
  it("메시지와 이벤트를 시간순으로 병합한다", () => {
    const messages = [msg("msg_b", "2026-07-03T10:02:00Z"), msg("msg_a", "2026-07-03T10:00:00Z")];
    const events = [evt("evt_1", "2026-07-03T10:01:00Z")];
    const merged = mergeTimeline(messages, events);
    expect(merged.map((i) => i.id)).toEqual(["msg_a", "evt_1", "msg_b"]);
    expect(merged[1]!.kind).toBe("event");
  });

  it("동시각이면 id로 안정 정렬한다", () => {
    const t = "2026-07-03T10:00:00Z";
    const merged = mergeTimeline([msg("msg_z", t), msg("msg_a", t)], [evt("evt_m", t)]);
    expect(merged.map((i) => i.id)).toEqual(["evt_m", "msg_a", "msg_z"]);
  });
});

describe("upsertMessage", () => {
  it("새 메시지는 추가 후 정렬한다", () => {
    const list = [msg("msg_a", "2026-07-03T10:00:00Z")];
    const out = upsertMessage(list, msg("msg_b", "2026-07-03T09:00:00Z"));
    expect(out.map((m) => m.id)).toEqual(["msg_b", "msg_a"]);
  });

  it("같은 id는 교체(중복 방지)", () => {
    const list = [msg("msg_a", "2026-07-03T10:00:00Z")];
    const updated = {
      ...msg("msg_a", "2026-07-03T10:00:00Z"),
      content: { type: "text" as const, text: "updated" },
    };
    const out = upsertMessage(list, updated);
    expect(out).toHaveLength(1);
    expect(out[0]!.content.text).toBe("updated");
  });
});
