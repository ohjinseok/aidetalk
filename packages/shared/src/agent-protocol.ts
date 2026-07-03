/**
 * Agent 커넥터 HTTP 계약 — 05_AGENT_PROTOCOL.md와 1:1.
 * ⚠️ 외부 공개 계약이므로 필드는 snake_case(내부 API의 camelCase와 구분).
 * ⚠️ CLAUDE.md 규칙 1: 여기에 LLM 호출 코드를 넣지 않는다. 스키마/검증만.
 *
 * 모르는 필드는 무시(strip) — zod object 기본 동작. 05 §버저닝 "에이전트는 모르는 필드를 무시".
 */
import { z } from "zod";

import { AppError } from "./errors";

/** 호출 모드. reply=손님에게 전달, assist=상담원에게만 표시. */
export const agentModeSchema = z.enum(["reply", "assist"]);
export type AgentMode = z.infer<typeof agentModeSchema>;

/** 메시지 role. history/현재 메시지 공용. */
export const agentMessageRoleSchema = z.enum(["visitor", "agent_ai", "agent_human", "system"]);
export type AgentMessageRole = z.infer<typeof agentMessageRoleSchema>;

/** 요청에 담기는 단일 메시지(현재 메시지 및 history 항목). */
export const agentProtocolMessageSchema = z.object({
  id: z.string(),
  role: agentMessageRoleSchema,
  text: z.string(),
  created_at: z.string(), // ISO 8601 UTC
});
export type AgentProtocolMessage = z.infer<typeof agentProtocolMessageSchema>;

/** 요청의 visitor 블록. email/name은 null 가능. attributes는 유저 정의 임의 값. */
export const agentRequestVisitorSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  attributes: z.record(z.unknown()),
  page_url: z.string(),
});

/** 요청의 workspace 블록. metadata는 유저가 워크스페이스 설정에서 정의한 임의 값. */
export const agentRequestWorkspaceSchema = z.object({
  id: z.string(),
  metadata: z.record(z.unknown()),
});

/**
 * AideTalk → Agent 요청 본문 — 05 문서 "요청".
 * history: 최근 20개, 오래된 것부터, 현재 message 미포함.
 */
export const agentRequestSchema = z.object({
  version: z.literal("1"),
  mode: agentModeSchema,
  conversation_id: z.string(),
  message: agentProtocolMessageSchema,
  history: z.array(agentProtocolMessageSchema),
  visitor: agentRequestVisitorSchema,
  workspace: agentRequestWorkspaceSchema,
});
export type AgentRequest = z.infer<typeof agentRequestSchema>;

// ---------- 응답 4종 ----------

/** 1) reply — 손님에게 보낼 답변 (mode=reply 전용). */
export const agentReplyResponseSchema = z.object({
  type: z.literal("reply"),
  text: z.string().min(1).max(4000),
  quick_replies: z.array(z.string().max(40)).max(5).optional(),
  typing_delay_ms: z.number().int().min(0).max(3000).optional(),
  track_links: z.boolean().default(true),
});
export type AgentReplyResponse = z.infer<typeof agentReplyResponseSchema>;

/** 2) handoff — 사람에게 넘기기 (mode=reply 전용). */
export const agentHandoffResponseSchema = z.object({
  type: z.literal("handoff"),
  reason: z.string().min(1), // 필수. 상담원에게 표시
  summary: z.string().optional(),
  message_to_visitor: z.string().optional(),
});
export type AgentHandoffResponse = z.infer<typeof agentHandoffResponseSchema>;

/** 3) noop — 침묵. */
export const agentNoopResponseSchema = z.object({
  type: z.literal("noop"),
});
export type AgentNoopResponse = z.infer<typeof agentNoopResponseSchema>;

/** suggest.actions 항목 — 최대 3개. */
export const agentSuggestActionSchema = z.object({
  label: z.string(),
  url: z.string(),
});

/** 4) suggest — 상담원 제안 (mode=assist 전용). 손님에게 절대 전달되지 않는다. */
export const agentSuggestResponseSchema = z.object({
  type: z.literal("suggest"),
  draft: z.string().min(1),
  rationale: z.string().optional(),
  actions: z.array(agentSuggestActionSchema).max(3).optional(),
});
export type AgentSuggestResponse = z.infer<typeof agentSuggestResponseSchema>;

/** 응답 4종 discriminated union(스키마 자체는 mode 무관). */
export const agentResponseSchema = z.discriminatedUnion("type", [
  agentReplyResponseSchema,
  agentHandoffResponseSchema,
  agentNoopResponseSchema,
  agentSuggestResponseSchema,
]);
export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type AgentResponseType = AgentResponse["type"];

/** mode별 허용 응답 타입 — 05 문서 "잘못된 조합 처리". */
export const REPLY_MODE_RESPONSE_TYPES = ["reply", "handoff", "noop"] as const;
export const ASSIST_MODE_RESPONSE_TYPES = ["suggest", "noop"] as const;

/** 해당 mode에서 그 응답 타입이 허용되는지 검사. */
export function isResponseAllowedForMode(mode: AgentMode, type: AgentResponseType): boolean {
  const allowed = mode === "reply" ? REPLY_MODE_RESPONSE_TYPES : ASSIST_MODE_RESPONSE_TYPES;
  return (allowed as readonly string[]).includes(type);
}

/**
 * 에이전트 응답 파싱 + mode 정합성 검증.
 * 스키마 불일치 또는 mode에 맞지 않는 타입(예: mode=reply에 suggest)이면
 * AppError("agent/bad_response", 502) throw — 04 §7 / 05 "잘못된 조합 처리".
 */
export function parseAgentResponse(mode: AgentMode, data: unknown): AgentResponse {
  const parsed = agentResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw AppError.of(
      "agent/bad_response",
      "에이전트 응답이 스키마와 일치하지 않습니다.",
      parsed.error.issues,
    );
  }
  if (!isResponseAllowedForMode(mode, parsed.data.type)) {
    throw AppError.of(
      "agent/bad_response",
      `mode=${mode}에서 허용되지 않는 응답 타입: ${parsed.data.type}`,
    );
  }
  return parsed.data;
}
