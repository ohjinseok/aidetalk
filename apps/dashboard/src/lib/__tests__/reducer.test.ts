import { describe, expect, it } from "vitest";

import type { InboxItem } from "@aidetalk/shared";
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

  it("incoming에 favorite가 없으면 기존 값을 보존한다", () => {
    const list = [{ ...item("conv_a", "2026-07-03T10:00:00Z"), favorite: true }];
    const incoming = item("conv_a", "2026-07-03T12:00:00Z"); // favorite 필드 없음
    const out = upsertInbox(list, incoming);
    expect(out[0]!.favorite).toBe(true);
  });

  it("incoming에 favorite가 있으면 교체한다", () => {
    const list = [{ ...item("conv_a", "2026-07-03T10:00:00Z"), favorite: true }];
    const incoming = { ...item("conv_a", "2026-07-03T12:00:00Z"), favorite: false };
    const out = upsertInbox(list, incoming);
    expect(out[0]!.favorite).toBe(false);
  });

  it("incoming에 unread/tagIds가 없으면 기존 값을 보존한다", () => {
    const list = [{ ...item("conv_a", "2026-07-03T10:00:00Z"), unread: 3, tagIds: ["tag_1"] }];
    const incoming = item("conv_a", "2026-07-03T12:00:00Z"); // unread/tagIds 없음
    const out = upsertInbox(list, incoming);
    expect(out[0]!.unread).toBe(3);
    expect(out[0]!.tagIds).toEqual(["tag_1"]);
  });

  it("incoming에 unread/tagIds가 있으면 교체한다", () => {
    const list = [{ ...item("conv_a", "2026-07-03T10:00:00Z"), unread: 3, tagIds: ["tag_1"] }];
    const incoming = { ...item("conv_a", "2026-07-03T12:00:00Z"), unread: 0, tagIds: ["tag_2"] };
    const out = upsertInbox(list, incoming);
    expect(out[0]!.unread).toBe(0);
    expect(out[0]!.tagIds).toEqual(["tag_2"]);
  });

  it("신규 항목(기존에 없던 대화)은 병합 없이 incoming 그대로 들어간다", () => {
    const list = [item("conv_a", "2026-07-03T10:00:00Z")];
    const incoming = { ...item("conv_b", "2026-07-03T12:00:00Z"), favorite: true };
    const out = upsertInbox(list, incoming);
    const b = out.find((i) => i.conversation.id === "conv_b")!;
    expect(b.favorite).toBe(true);
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

  it("patch는 conversation만 갱신하고 favorite/unread/tagIds는 보존한다", () => {
    const list = [
      { ...item("conv_a", "2026-07-03T10:00:00Z"), favorite: true, unread: 2, tagIds: ["tag_1"] },
    ];
    const patched = {
      ...item("conv_a", "2026-07-03T10:00:00Z").conversation,
      mode: "human" as const,
    };
    const out = patchInboxConversation(list, patched);
    expect(out[0]!.favorite).toBe(true);
    expect(out[0]!.unread).toBe(2);
    expect(out[0]!.tagIds).toEqual(["tag_1"]);
  });
});
