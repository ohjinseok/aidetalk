/**
 * 웹훅 shared secret 생성/마스킹 — agents(lib/agent-secret.ts)와 동일 패턴(08 §7: "Agent와 동일 규약").
 * 형식: `whsec_` + 32바이트 random(base64url). 원문은 생성 응답 1회만 노출.
 * DB에는 sha256 해시(식별·비교) + AES-GCM 암호문(아웃바운드 서명)만 저장한다.
 */
import { randomBytes } from "node:crypto";

/** 새 웹훅 secret 원문 생성. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

/** 로그/에러에 secret을 남겨야 할 때의 마스킹 — `whsec_ab****`(CLAUDE.md 규칙 5). */
export function maskWebhookSecret(secret: string): string {
  const body = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return `whsec_${body.slice(0, 2)}****`;
}
