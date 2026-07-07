import { describe, expect, it } from "vitest";

import {
  conversationNoteSchema,
  conversationSummarySchema,
  eventTypeSchema,
  tagColorSchema,
  tagSchema,
} from "../entities";

const sampleConversation = {
  id: "conv_1",
  workspaceId: "ws_1",
  visitorId: "vis_1",
  status: "open",
  mode: "ai",
  assigneeId: null,
  lastMessageAt: "2026-06-12T09:00:00Z",
  metadata: {},
  createdAt: "2026-06-12T09:00:00Z",
};

describe("tagColorSchema", () => {
  it("정의된 팔레트 색상만 허용한다", () => {
    expect(tagColorSchema.safeParse("indigo").success).toBe(true);
    expect(tagColorSchema.safeParse("magenta").success).toBe(false);
  });
});

describe("tagSchema", () => {
  it("유효한 태그를 파싱한다", () => {
    const result = tagSchema.safeParse({
      id: "tag_1",
      workspaceId: "ws_1",
      name: "VIP",
      color: "amber",
      createdAt: "2026-06-12T09:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("잘못된 color는 거부한다", () => {
    const result = tagSchema.safeParse({
      id: "tag_1",
      workspaceId: "ws_1",
      name: "VIP",
      color: "not-a-color",
      createdAt: "2026-06-12T09:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("conversationNoteSchema", () => {
  it("authorName 없이도 통과한다(옵셔널 조인 필드)", () => {
    const result = conversationNoteSchema.safeParse({
      id: "note_1",
      conversationId: "conv_1",
      authorId: "usr_1",
      body: "고객이 환불 요청함",
      createdAt: "2026-06-12T09:00:00Z",
      updatedAt: "2026-06-12T09:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("authorName이 null이어도 통과한다", () => {
    const result = conversationNoteSchema.safeParse({
      id: "note_1",
      conversationId: "conv_1",
      authorId: "usr_1",
      authorName: null,
      body: "메모",
      createdAt: "2026-06-12T09:00:00Z",
      updatedAt: "2026-06-12T09:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("body가 없으면 거부한다", () => {
    const result = conversationNoteSchema.safeParse({
      id: "note_1",
      conversationId: "conv_1",
      authorId: "usr_1",
      createdAt: "2026-06-12T09:00:00Z",
      updatedAt: "2026-06-12T09:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("eventTypeSchema", () => {
  it("pending 이벤트 타입을 허용한다(보류 전환)", () => {
    expect(eventTypeSchema.safeParse("pending").success).toBe(true);
  });
});

describe("conversationSummarySchema", () => {
  it("unread/tagIds 없이도 통과한다(전방 호환)", () => {
    const result = conversationSummarySchema.safeParse({
      conversation: sampleConversation,
      visitor: { id: "vis_1", name: null, email: null },
      lastMessage: null,
    });
    expect(result.success).toBe(true);
  });

  it("unread/tagIds를 포함해도 통과한다(WS inbox.upsert 전달용)", () => {
    const result = conversationSummarySchema.safeParse({
      conversation: sampleConversation,
      visitor: { id: "vis_1", name: null, email: null },
      lastMessage: null,
      unread: 3,
      tagIds: ["tag_1", "tag_2"],
    });
    expect(result.success).toBe(true);
  });
});
