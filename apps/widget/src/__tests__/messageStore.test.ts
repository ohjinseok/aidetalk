import { describe, expect, it } from "vitest";

import { MessageStore } from "../app/lib/messageStore";
import type { Message } from "../app/shared";

function msg(id: string, text: string, createdAt: string, role: Message["role"] = "visitor"): Message {
  return {
    id,
    conversationId: "conv_1",
    role,
    authorId: role === "system" ? null : "vis_1",
    content: { type: "text", text },
    createdAt,
  };
}

describe("app/lib/messageStore — 전송 파이프라인 (06 §4.1)", () => {
  it("낙관적 pending → ack로 확정 치환", () => {
    const s = new MessageStore();
    s.addPending("cm_1", "안녕", "2026-07-03T00:00:00.000Z");
    expect(s.pendingCount()).toBe(1);
    expect(s.confirmedCount()).toBe(0);

    s.ack("cm_1", msg("msg_1", "안녕", "2026-07-03T00:00:01.000Z"));
    expect(s.pendingCount()).toBe(0);
    expect(s.confirmedCount()).toBe(1);

    const items = s.displayItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "confirmed", message: { id: "msg_1" } });
  });

  it("중복 ack(같은 clientMsgId 재수신)는 메시지를 복제하지 않는다", () => {
    const s = new MessageStore();
    s.addPending("cm_1", "안녕", "2026-07-03T00:00:00.000Z");
    const m = msg("msg_1", "안녕", "2026-07-03T00:00:01.000Z");
    s.ack("cm_1", m);
    s.ack("cm_1", m); // 재전송으로 서버가 기존 메시지 재ack
    expect(s.confirmedCount()).toBe(1);
    expect(s.pendingCount()).toBe(0);
  });

  it("message.new 중복(id 동일)은 upsert로 무시", () => {
    const s = new MessageStore();
    const m = msg("msg_2", "응답", "2026-07-03T00:00:02.000Z", "agent_ai");
    s.upsert(m);
    s.upsert(m);
    expect(s.confirmedCount()).toBe(1);
  });

  it("확정 메시지는 createdAt 기준 정렬, pending은 항상 맨 아래", () => {
    const s = new MessageStore();
    s.upsert(msg("msg_b", "둘째", "2026-07-03T00:00:02.000Z", "agent_ai"));
    s.upsert(msg("msg_a", "첫째", "2026-07-03T00:00:01.000Z"));
    s.addPending("cm_9", "보내는중", "2026-07-03T00:00:00.000Z"); // createdAt 빨라도 맨 아래

    const items = s.displayItems();
    expect(items.map((i) => (i.kind === "confirmed" ? i.message.id : "PENDING"))).toEqual([
      "msg_a",
      "msg_b",
      "PENDING",
    ]);
  });

  it("lastConfirmedCursor는 마지막 확정 메시지의 base64url {createdAt,id} 커서(04 §0)", () => {
    const s = new MessageStore();
    expect(s.lastConfirmedCursor()).toBeNull();
    s.upsert(msg("msg_a", "a", "2026-07-03T00:00:01.000Z"));
    s.upsert(msg("msg_b", "b", "2026-07-03T00:00:03.000Z"));
    const cursor = s.lastConfirmedCursor()!;
    // 서버 decodeCursor와 동일하게 base64url → JSON { createdAt, id } 복원되어야 한다.
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { createdAt: string; id: string };
    expect(decoded).toEqual({ createdAt: "2026-07-03T00:00:03.000Z", id: "msg_b" });
  });

  it("markFailed 후 pendingIds로 재전송 대상 유지", () => {
    const s = new MessageStore();
    s.addPending("cm_1", "실패건", "2026-07-03T00:00:00.000Z");
    s.markFailed("cm_1");
    expect(s.pendingIds()).toEqual([{ clientMsgId: "cm_1", text: "실패건" }]);
    const failed = s.displayItems()[0];
    expect(failed).toMatchObject({ kind: "pending", pending: { status: "failed" } });
  });

  it("quickReplies는 마지막 상대 메시지에서만 노출", () => {
    const s = new MessageStore();
    const withQr: Message = {
      ...msg("msg_a", "안내", "2026-07-03T00:00:01.000Z", "agent_ai"),
      content: { type: "text", text: "안내", quickReplies: ["상담원 연결"] },
    };
    s.upsert(withQr);
    expect(s.lastConfirmed()?.content.quickReplies).toEqual(["상담원 연결"]);
  });
});
