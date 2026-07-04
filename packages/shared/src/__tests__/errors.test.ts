import { describe, expect, it } from "vitest";

import { AppError, ERROR_CODES, ERROR_STATUS, errorEnvelopeSchema } from "../errors";

describe("AppError", () => {
  it("code↔status가 04 §7 표와 일치한다", () => {
    expect(ERROR_STATUS).toMatchObject({
      "auth/invalid": 401,
      "auth/forbidden": 403,
      "validation/failed": 400,
      not_found: 404,
      "rate/limited": 429,
      "plan/limit_exceeded": 402,
      "agent/timeout": 504,
      "agent/bad_response": 502,
      "conversion/duplicate": 409,
      conflict: 409,
      internal: 500,
    });
    expect(ERROR_CODES).toHaveLength(11);
  });

  it("AppError.of는 표에서 status를 자동 매핑한다", () => {
    const err = AppError.of("not_found", "없음");
    expect(err.code).toBe("not_found");
    expect(err.httpStatus).toBe(404);
    expect(err.message).toBe("없음");
    expect(err).toBeInstanceOf(Error);
  });

  it("message 미지정 시 code를 message로 쓴다", () => {
    expect(AppError.of("conflict").message).toBe("conflict");
  });

  it("생성자는 code/httpStatus/message를 그대로 받는다", () => {
    const err = new AppError("plan/limit_exceeded", 402, "한도 초과");
    expect(err.httpStatus).toBe(402);
  });

  it("toEnvelope는 04 §0 봉투 형태로 직렬화한다", () => {
    const env = AppError.of("rate/limited", "느려요").toEnvelope();
    expect(env).toEqual({ error: { code: "rate/limited", message: "느려요" } });
    expect(errorEnvelopeSchema.safeParse(env).success).toBe(true);
  });
});

describe("errorEnvelopeSchema", () => {
  it("표에 있는 code만 허용한다", () => {
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: "not_found", message: "x" } }).success,
    ).toBe(true);
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: "made/up", message: "x" } }).success,
    ).toBe(false);
  });
});
