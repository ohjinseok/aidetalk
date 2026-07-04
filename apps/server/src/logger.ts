/**
 * pino 구조화 로그 — 02_ARCHITECTURE.md §7.
 * x-request-id를 로그에 실어 요청 추적. 시크릿은 절대 로그에 남기지 않는다(CLAUDE.md 규칙 5).
 */
import { randomBytes } from "node:crypto";

import pino, { type Logger } from "pino";

/** 지정 레벨로 루트 로거 생성. */
export function createLogger(level: string): Logger {
  return pino({
    level,
    // 시크릿/토큰 계열 필드는 로그 직렬화 단계에서 마스킹(방어적 기본값).
    redact: {
      paths: [
        "password",
        "passwordHash",
        "secret",
        "token",
        "visitorToken",
        "authorization",
        "*.password",
        "*.secret",
        "*.token",
      ],
      censor: "[redacted]",
    },
  });
}

/** 요청 상관관계 ID 생성(x-request-id 없을 때). */
export function genRequestId(): string {
  return `req_${randomBytes(9).toString("base64url")}`;
}

export type { Logger };
