/**
 * REST 요청 본문 zod 스키마 — 04_API_SPEC.md §1, §2.
 *
 * NOTE(decision): §6 공유 객체(응답 형태)는 packages/shared가 단일 출처지만,
 *   요청 본문 스키마는 아직 shared에 없다. 위젯/대시보드가 병렬 작업 중이라
 *   이번 웨이브에서는 서버 로컬에 두고, 계약이 안정되면 packages/shared로 승격한다.
 */
import { z } from "zod";

// ---------- 위젯 API (§1) ----------
export const sessionRequestSchema = z.object({
  workspaceId: z.string().min(1),
  existingToken: z.string().optional(),
  pageUrl: z.string().optional(),
  referrer: z.string().optional(),
});
export type SessionRequest = z.infer<typeof sessionRequestSchema>;

export const createConversationRequestSchema = z.object({
  pageUrl: z.string().optional(),
});
export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;

export const profilePatchRequestSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
  })
  .refine((v) => v.email !== undefined || v.name !== undefined, {
    message: "email 또는 name 중 하나는 필요하다.",
  });
export type ProfilePatchRequest = z.infer<typeof profilePatchRequestSchema>;

/** long-poll 폴백 전송(§1 마지막 줄) — WS message.send와 동일 처리. */
export const longPollSendRequestSchema = z.object({
  clientMsgId: z.string().min(1),
  text: z.string().min(1).max(4000),
});
export type LongPollSendRequest = z.infer<typeof longPollSendRequestSchema>;

// ---------- 인증/계정 (§2) ----------
export const signupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "비밀번호는 최소 8자."), // 08 §3
  name: z.string().min(1),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// ---------- 워크스페이스 (§2) ----------
export const createWorkspaceRequestSchema = z.object({
  name: z.string().min(1),
  segment: z.enum(["s1_site", "s2_no_site"]).default("s1_site"),
});
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;
