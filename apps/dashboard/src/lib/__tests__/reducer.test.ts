import { describe, expect, it } from "vitest";

import type { InboxItem } from "../api/schemas";
import { patchInboxConversation, removeInbox, upsertInbox } from "../ws/reducer";

function item(
  id: string,
  lastMessageAt: string | null,
  status: "open" | "pending" | "closed" = "open",
): InboxItem {
  return {
    conversation: {
      id,
      workspaceId: "ws_1",
      visitorId: "vis_1",
      status,
      mode: "ai",
      assigneeId: null,
      lastMessageAt,
      metadata: {},
      createdAt: "2026-07-03T00:00:00Z",
    },
    visitor: { id: "vis_1", name: null, email: null },
    lastMessage: null,
  };
}

describe("upsertInbox", () => {
  it("새 항목을 추가하고 lastMessageAt desc로 정렬한다", () => {
    const list = [item("conv_a", "2026-07-03T10:00:00Z")];
    const out = upsertInbox(list, item("conv_b", "2026-07-03T11:00:00Z"));
    expect(out.map((i) => i.conversation.id)).toEqual(["conv_b", "conv_a"]);
  });

  it("기존 항목은 교체하고 재정렬한다(중복 없음)", () => {
    const list = [item("conv_a", "2026-07-03T10:00:00Z"), item("conv_b", "2026-07-03T09:00:00Z")];
    const out = upsertInbox(list, item("conv_b", "2026-07-03T12:00:00Z"));
    expect(out).toHaveLength(2);
    expect(out.map((i) => i.conversation.id)).toEqual(["conv_b", "conv_a"]);
  });

  it("필터와 상태가 다르면 목록에서 제거한다(탭 이탈)", () => {
    const list = [item("conv_a", "2026-07-03T10:00:00Z", "open")];
    const out = upsertInbox(list, item("conv_a", "2026-07-03T12:00:00Z", "closed"), "open");
    expect(out).toHaveLength(0);
  });
});

describe("removeInbox / patchInboxConversation", () => {
  it("removeInbox는 해당 대화를 제거한다", () => {
    const list = [item("conv_a", "2026-07-03T10:00:00Z"), item("conv_b", "2026-07-03T09:00:00Z")];
    expect(removeInbox(list, "conv_a").map((i) => i.conversation.id)).toEqual(["conv_b"]);
  });

  it("patch는 존재하는 대화만 갱신한다", () => {
    const list = [item("conv_a", "2026-07-03T10:00:00Z")];
    const patched = {
      ...item("conv_a", "2026-07-03T10:00:00Z").conversation,
      mode: "human" as const,
    };
    const out = patchInboxConversation(list, patched);
    expect(out[0]!.conversation.mode).toBe("human");
  });

  it("patch로 상태가 필터를 벗어나면 제거", () => {
    const list = [item("conv_a", "2026-07-03T10:00:00Z", "open")];
    const patched = { ...item("conv_a", "2026-07-03T10:00:00Z", "closed").conversation };
    const out = patchInboxConversation(list, patched, "open");
    expect(out).toHaveLength(0);
  });
});
