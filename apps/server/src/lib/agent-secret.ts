/**
 * Agent shared secret 생성 — 08_SECURITY.md §1.
 * 형식: `adt_` + 32바이트 random(base64url). 원문은 생성/재발급 응답 1회만 노출.
 * DB에는 sha256 해시(식별·비교) + AES-GCM 암호문(아웃바운드 서명)만 저장한다.
 */
import { randomBytes } from "node:crypto";

/** 새 커넥터 secret 원문 생성. */
export function generateAgentSecret(): string {
  return `adt_${randomBytes(32).toString("base64url")}`;
}
