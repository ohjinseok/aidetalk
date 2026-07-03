/**
 * 통일 에러 타입 + 에러 코드 표 — 04_API_SPEC.md §7.
 * AppError.code는 아래 표에 있는 코드만 허용한다(타입으로 강제). 표에 없는 코드 금지.
 */
import { z } from "zod";

/** 04 문서 §7 에러 코드 → HTTP status 매핑(전체). 이 표가 단일 출처. */
export const ERROR_STATUS = {
  "auth/invalid": 401, // 인증 실패/토큰 무효
  "auth/forbidden": 403, // 권한 없음(타 워크스페이스, visitor의 상담원 자원 접근 등)
  "validation/failed": 400, // zod 검증 실패 (details에 필드 오류)
  not_found: 404, // 리소스 없음 / S2에 트래킹 API 접근
  "rate/limited": 429, // 레이트리밋
  "plan/limit_exceeded": 402, // 플랜 한도 초과(대화 수/시트)
  "agent/timeout": 504, // 에이전트 응답 타임아웃
  "agent/bad_response": 502, // 에이전트 응답 스키마 불일치
  "conversion/duplicate": 409, // 동일 external_ref 재수신 (내부용 — /t/*는 204로 감춤)
  conflict: 409, // 기타 상태 충돌(이미 active agent 존재 등)
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** 에러 코드 목록(런타임). z.enum·검증에 사용. */
export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];

/**
 * 전 계층 공통 에러. code는 04 §7 표만, httpStatus는 그 코드의 표준 status.
 * 대개 `AppError.of(code, message)`로 생성하면 status가 표에서 자동 매핑된다.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, httpStatus: number, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  /** 표준 status를 표에서 자동 매핑해 생성. 권장 생성 방식. */
  static of(code: ErrorCode, message?: string, details?: unknown): AppError {
    return new AppError(code, ERROR_STATUS[code], message, details);
  }

  /** 04 §0 에러 봉투 형태로 직렬화. */
  toEnvelope(): ErrorEnvelope {
    return { error: { code: this.code, message: this.message } };
  }
}

/** 실패 응답 봉투 — 04 문서 §0. `{ error: { code, message } }`. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
