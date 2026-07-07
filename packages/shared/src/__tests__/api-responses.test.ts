import { describe, expect, it } from "vitest";

import {
  conversationDetailSchema,
  conversationTagIdsResponseSchema,
  inboxCountsSchema,
  inboxItemSchema,
  noteResponseSchema,
  notesListResponseSchema,
  tagResponseSchema,
  tagsListResponseSchema,
  visitorDetailSchema,
  visitorResponseSchema,
} from "../api-responses";

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

const sampleVisitor = { id: "vis_1", name: null, email: null };

describe("inboxItemSchema", () => {
  it("favorite/unread/tagIds를 모두 포함해도 통과한다", () => {
    const result = inboxItemSchema.safeParse({
      conversation: sampleConversation,
      visitor: sampleVisitor,
      lastMessage: null,
      favorite: true,
      unread: 2,
      tagIds: ["tag_1"],
    });
    expect(result.success).toBe(true);
  });

  it("favorite 없이도 통과한다(옵셔널)", () => {
    const result = inboxItemSchema.safeParse({
      conversation: sampleConversation,
      visitor: sampleVisitor,
      lastMessage: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("inboxCountsSchema", () => {
  it("모든 필수 카운트 필드가 있으면 통과한다", () => {
    const result = inboxCountsSchema.safeParse({
      mine: 3,
      all: 10,
      unread: 4,
      favorites: 1,
      unassigned: 2,
      byAssignee: [{ assigneeId: "usr_1", count: 3 }],
      byTag: [{ tagId: "tag_1", count: 5 }],
    });
    expect(result.success).toBe(true);
  });

  it("필수 필드가 빠지면 거부한다", () => {
    const result = inboxCountsSchema.safeParse({
      mine: 3,
      all: 10,
    });
    expect(result.success).toBe(false);
  });
});

describe("visitorDetailSchema", () => {
  it("locale/timezone 없이도 통과한다", () => {
    expect(visitorDetailSchema.safeParse({ id: "vis_1" }).success).toBe(true);
  });

  it("locale/timezone이 null이어도 통과한다", () => {
    const result = visitorDetailSchema.safeParse({
      id: "vis_1",
      locale: null,
      timezone: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("visitorResponseSchema", () => {
  it("visitor 봉투로 감싼 형태를 파싱한다", () => {
    const result = visitorResponseSchema.safeParse({ visitor: { id: "vis_1" } });
    expect(result.success).toBe(true);
  });
});

describe("conversationDetailSchema", () => {
  it("favorite/tagIds 없이도 통과한다(전방 호환)", () => {
    const result = conversationDetailSchema.safeParse({
      conversation: sampleConversation,
      visitor: { id: "vis_1" },
      events: [],
    });
    expect(result.success).toBe(true);
  });

  it("favorite/tagIds를 포함해도 통과한다", () => {
    const result = conversationDetailSchema.safeParse({
      conversation: sampleConversation,
      visitor: { id: "vis_1" },
      events: [],
      favorite: true,
      tagIds: ["tag_1", "tag_2"],
    });
    expect(result.success).toBe(true);
  });
});

describe("태그/메모 응답 봉투", () => {
  it("tagResponseSchema/tagsListResponseSchema를 파싱한다", () => {
    const tag = {
      id: "tag_1",
      workspaceId: "ws_1",
      name: "VIP",
      color: "amber",
      createdAt: "2026-06-12T09:00:00Z",
    };
    expect(tagResponseSchema.safeParse({ tag }).success).toBe(true);
    expect(tagsListResponseSchema.safeParse({ items: [tag] }).success).toBe(true);
  });

  it("noteResponseSchema/notesListResponseSchema를 파싱한다", () => {
    const note = {
      id: "note_1",
      conversationId: "conv_1",
      authorId: "usr_1",
      body: "메모",
      createdAt: "2026-06-12T09:00:00Z",
      updatedAt: "2026-06-12T09:00:00Z",
    };
    expect(noteResponseSchema.safeParse({ note }).success).toBe(true);
    expect(notesListResponseSchema.safeParse({ items: [note] }).success).toBe(true);
  });

  it("conversationTagIdsResponseSchema를 파싱한다", () => {
    expect(
      conversationTagIdsResponseSchema.safeParse({ tagIds: ["tag_1", "tag_2"] }).success,
    ).toBe(true);
  });
});
