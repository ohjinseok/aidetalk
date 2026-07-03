import { describe, expect, it } from "vitest";

import { AppError } from "../errors";
import {
  agentRequestSchema,
  agentResponseSchema,
  isResponseAllowedForMode,
  parseAgentResponse,
} from "../agent-protocol";

const validRequest = {
  version: "1",
  mode: "reply",
  conversation_id: "conv_abc123",
  message: {
    id: "msg_001",
    role: "visitor",
    text: "배송 언제 와요?",
    created_at: "2026-06-12T09:00:00Z",
  },
  history: [
    { id: "msg_000", role: "agent_ai", text: "안녕하세요!", created_at: "2026-06-12T08:59:00Z" },
  ],
  visitor: {
    id: "vis_xyz",
    email: "kim@example.com",
    name: null,
    attributes: { 주문번호: "ORD-123" },
    page_url: "https://shop.com/orders",
  },
  workspace: { id: "ws_1", metadata: {} },
};

describe("agentRequestSchema", () => {
  it("유효한 요청을 파싱한다", () => {
    expect(agentRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("모르는 필드는 무시(strip)한다", () => {
    const parsed = agentRequestSchema.parse({ ...validRequest, unknown_extra: "무시됨" });
    expect("unknown_extra" in parsed).toBe(false);
  });

  it("version이 '1'이 아니면 거부한다", () => {
    expect(agentRequestSchema.safeParse({ ...validRequest, version: "2" }).success).toBe(false);
  });
});

describe("agentResponseSchema — 성공 4종", () => {
  it("reply", () => {
    const r = agentResponseSchema.parse({
      type: "reply",
      text: "내일 도착합니다.",
      quick_replies: ["다른 문의", "상담원 연결"],
      typing_delay_ms: 600,
    });
    // track_links 기본 true 적용
    expect(r.type === "reply" && r.track_links).toBe(true);
  });

  it("handoff", () => {
    expect(agentResponseSchema.safeParse({ type: "handoff", reason: "환불 요청" }).success).toBe(
      true,
    );
  });

  it("noop", () => {
    expect(agentResponseSchema.safeParse({ type: "noop" }).success).toBe(true);
  });

  it("suggest", () => {
    expect(
      agentResponseSchema.safeParse({
        type: "suggest",
        draft: "재고 2개 남았어요!",
        actions: [{ label: "링크", url: "https://shop.com/x" }],
      }).success,
    ).toBe(true);
  });
});

describe("agentResponseSchema — 제약 위반 거부", () => {
  it("text 4000자 초과 거부", () => {
    expect(agentResponseSchema.safeParse({ type: "reply", text: "가".repeat(4001) }).success).toBe(
      false,
    );
  });

  it("text 빈 문자열 거부", () => {
    expect(agentResponseSchema.safeParse({ type: "reply", text: "" }).success).toBe(false);
  });

  it("quick_replies 6개 초과 거부", () => {
    expect(
      agentResponseSchema.safeParse({
        type: "reply",
        text: "x",
        quick_replies: ["1", "2", "3", "4", "5", "6"],
      }).success,
    ).toBe(false);
  });

  it("quick_reply 40자 초과 거부", () => {
    expect(
      agentResponseSchema.safeParse({ type: "reply", text: "x", quick_replies: ["가".repeat(41)] })
        .success,
    ).toBe(false);
  });

  it("typing_delay_ms 3000 초과 거부", () => {
    expect(
      agentResponseSchema.safeParse({ type: "reply", text: "x", typing_delay_ms: 3001 }).success,
    ).toBe(false);
  });

  it("suggest actions 3개 초과 거부", () => {
    expect(
      agentResponseSchema.safeParse({
        type: "suggest",
        draft: "x",
        actions: [1, 2, 3, 4].map((n) => ({ label: `${n}`, url: "https://x" })),
      }).success,
    ).toBe(false);
  });
});

describe("mode 정합성 (parseAgentResponse / isResponseAllowedForMode)", () => {
  it("mode=reply는 reply/handoff/noop 허용, suggest 금지", () => {
    expect(isResponseAllowedForMode("reply", "reply")).toBe(true);
    expect(isResponseAllowedForMode("reply", "handoff")).toBe(true);
    expect(isResponseAllowedForMode("reply", "noop")).toBe(true);
    expect(isResponseAllowedForMode("reply", "suggest")).toBe(false);
  });

  it("mode=assist는 suggest/noop 허용, reply/handoff 금지", () => {
    expect(isResponseAllowedForMode("assist", "suggest")).toBe(true);
    expect(isResponseAllowedForMode("assist", "noop")).toBe(true);
    expect(isResponseAllowedForMode("assist", "reply")).toBe(false);
    expect(isResponseAllowedForMode("assist", "handoff")).toBe(false);
  });

  it("mode=reply에 suggest 응답이면 agent/bad_response throw", () => {
    try {
      parseAgentResponse("reply", { type: "suggest", draft: "x" });
      throw new Error("throw 되어야 함");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("agent/bad_response");
      expect((e as AppError).httpStatus).toBe(502);
    }
  });

  it("mode=assist에 reply 응답이면 agent/bad_response throw", () => {
    expect(() => parseAgentResponse("assist", { type: "reply", text: "x" })).toThrow(AppError);
  });

  it("스키마 자체가 깨지면 agent/bad_response throw", () => {
    expect(() => parseAgentResponse("reply", { type: "unknown" })).toThrow(AppError);
  });

  it("정상 조합은 파싱 결과를 반환한다", () => {
    const r = parseAgentResponse("assist", { type: "suggest", draft: "제안" });
    expect(r.type).toBe("suggest");
  });
});
