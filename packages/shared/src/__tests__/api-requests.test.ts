import { describe, expect, it } from "vitest";

import {
  agentUpdateVisitorRequestSchema,
  createNoteRequestSchema,
  createTagRequestSchema,
  sessionRequestSchema,
  setConversationTagRequestSchema,
  updateNoteRequestSchema,
  updateTagRequestSchema,
} from "../api-requests";

describe("sessionRequestSchema", () => {
  it("locale/timezone 없이도 통과한다(구버전 위젯 호환)", () => {
    expect(sessionRequestSchema.safeParse({ workspaceId: "ws_1" }).success).toBe(true);
  });

  it("locale/timezone을 포함해도 통과한다", () => {
    const result = sessionRequestSchema.safeParse({
      workspaceId: "ws_1",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    });
    expect(result.success).toBe(true);
  });

  it("locale이 너무 길면 거부한다", () => {
    const result = sessionRequestSchema.safeParse({
      workspaceId: "ws_1",
      locale: "a".repeat(36),
    });
    expect(result.success).toBe(false);
  });
});

describe("createTagRequestSchema", () => {
  it("color 생략 시 gray로 기본값 적용한다", () => {
    const result = createTagRequestSchema.parse({ name: "VIP" });
    expect(result.color).toBe("gray");
  });

  it("name이 비어있으면 거부한다", () => {
    expect(createTagRequestSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("name이 50자를 넘으면 거부한다", () => {
    expect(createTagRequestSchema.safeParse({ name: "a".repeat(51) }).success).toBe(false);
  });
});

describe("updateTagRequestSchema", () => {
  it("name/color 둘 다 없으면 거부한다", () => {
    expect(updateTagRequestSchema.safeParse({}).success).toBe(false);
  });

  it("name만 있어도 통과한다", () => {
    expect(updateTagRequestSchema.safeParse({ name: "재구매" }).success).toBe(true);
  });

  it("color만 있어도 통과한다", () => {
    expect(updateTagRequestSchema.safeParse({ color: "teal" }).success).toBe(true);
  });
});

describe("setConversationTagRequestSchema", () => {
  it("tagId가 비어있으면 거부한다", () => {
    expect(setConversationTagRequestSchema.safeParse({ tagId: "" }).success).toBe(false);
  });

  it("유효한 tagId면 통과한다", () => {
    expect(setConversationTagRequestSchema.safeParse({ tagId: "tag_1" }).success).toBe(true);
  });
});

describe("createNoteRequestSchema / updateNoteRequestSchema", () => {
  it("body가 비어있으면 거부한다", () => {
    expect(createNoteRequestSchema.safeParse({ body: "" }).success).toBe(false);
    expect(updateNoteRequestSchema.safeParse({ body: "" }).success).toBe(false);
  });

  it("body가 2000자를 넘으면 거부한다", () => {
    const long = "a".repeat(2001);
    expect(createNoteRequestSchema.safeParse({ body: long }).success).toBe(false);
    expect(updateNoteRequestSchema.safeParse({ body: long }).success).toBe(false);
  });

  it("유효한 body면 통과한다", () => {
    expect(createNoteRequestSchema.safeParse({ body: "메모 내용" }).success).toBe(true);
  });
});

describe("agentUpdateVisitorRequestSchema", () => {
  it("아무 필드도 없으면 거부한다", () => {
    expect(agentUpdateVisitorRequestSchema.safeParse({}).success).toBe(false);
  });

  it("name만 있어도 통과한다", () => {
    expect(agentUpdateVisitorRequestSchema.safeParse({ name: "홍길동" }).success).toBe(true);
  });

  it("null로 초기화(name=null)해도 통과한다", () => {
    expect(agentUpdateVisitorRequestSchema.safeParse({ name: null }).success).toBe(true);
  });

  it("잘못된 email 형식은 거부한다", () => {
    expect(agentUpdateVisitorRequestSchema.safeParse({ email: "not-an-email" }).success).toBe(
      false,
    );
  });

  it("유효한 email이면 통과한다", () => {
    expect(
      agentUpdateVisitorRequestSchema.safeParse({ email: "user@example.com" }).success,
    ).toBe(true);
  });
});
