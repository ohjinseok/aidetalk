/**
 * REST API 클라이언트 — fetch 래퍼 + shared zod 파싱 + 에러 봉투 처리.
 *
 * - 베이스 경로는 `/api` (Next rewrites가 {SERVER_URL}로 프록시, 쿠키 동일 출처 전달 → 10 문서).
 * - 응답은 zod 스키마로 파싱한다(계약 위반 조기 감지). 실패 응답은 04 §0 봉투 → ApiError.
 * - 서버 컴포넌트에서 쓸 때는 쿠키를 명시적으로 넘길 수 있도록 headers 옵션을 받는다.
 */
import { errorEnvelopeSchema } from "@aidetalk/shared";
import type { z } from "zod";

/** API 베이스 경로. 서버 컴포넌트(절대 URL 필요) 대비 origin 접두. */
export const API_BASE = "/api";

/** 통일 클라이언트 에러 — code는 04 §7 봉투 코드 또는 'network'/'unknown'. */
export class ApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: string, httpStatus: number, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  /** 서버 컴포넌트에서 쿠키 전달용. */
  headers?: Record<string, string>;
  /** 절대 origin(서버 컴포넌트에서 필요). 기본은 상대경로. */
  baseUrl?: string;
  signal?: AbortSignal;
}

/**
 * API 호출 + 스키마 파싱. 실패 시 ApiError throw.
 * @param schema 성공 응답을 검증할 zod 스키마. null이면 파싱 없이 반환(void 응답 등).
 */
export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T> | null,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const base = opts.baseUrl ?? API_BASE;
  const url = `${base}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(opts.headers ?? {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "include",
      signal: opts.signal,
    });
  } catch (err) {
    throw new ApiError("network", 0, err instanceof Error ? err.message : "network error");
  }

  if (res.status === 204) {
    // 본문 없음. 스키마가 있으면 빈 객체로 파싱 시도.
    return (schema ? schema.parse(undefined as unknown) : (undefined as T)) as T;
  }

  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  if (!res.ok) {
    const parsed = errorEnvelopeSchema.safeParse(json);
    if (parsed.success) {
      throw new ApiError(parsed.data.error.code, res.status, parsed.data.error.message);
    }
    throw new ApiError("unknown", res.status, `HTTP ${res.status}`);
  }

  if (!schema) return undefined as T;

  const result = schema.safeParse(json);
  if (!result.success) {
    // 계약 위반: 서버 응답이 스키마와 불일치. 통합 단계에서 잡아야 할 개발자용 메시지
    // (사용자 노출은 code→errors.* 매핑으로 처리하므로 message는 영어 디버그 문자열로 통일).
    throw new ApiError("agent/bad_response", res.status, "response schema mismatch", result.error);
  }
  return result.data;
}
