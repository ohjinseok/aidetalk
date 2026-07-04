/**
 * Agent shared secret 생성/마스킹 — 08_SECURITY.md §1.
 * 형식: `adt_` + 32바이트 random(base64url). 원문은 생성/재발급 응답 1회만 노출.
 * DB에는 sha256 해시(식별·비교) + AES-GCM 암호문(아웃바운드 서명)만 저장한다.
 */
import { randomBytes } from "node:crypto";

/** 새 커넥터 secret 원문 생성. */
export function generateAgentSecret(): string {
  return `adt_${randomBytes(32).toString("base64url")}`;
}

/**
 * 로그/에러에 secret을 남겨야 할 때의 마스킹 — `adt_ab****`.
 * 원문은 절대 그대로 로그에 남기지 않는다(CLAUDE.md 규칙 5).
 */
export function maskAgentSecret(secret: string): string {
  const body = secret.startsWith("adt_") ? secret.slice(4) : secret;
  return `adt_${body.slice(0, 2)}****`;
}
