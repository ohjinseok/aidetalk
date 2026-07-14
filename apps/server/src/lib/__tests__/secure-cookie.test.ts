/**
 * 세션 쿠키 Secure 플래그 판정 — EDITION이 아니라 공개 오리진 scheme 기준(08 §3).
 */
import { describe, expect, it } from "vitest";

import { shouldUseSecureCookie } from "../secure-cookie";

describe("shouldUseSecureCookie", () => {
  it("https 대시보드 오리진이면 Secure를 붙인다(셀프호스팅 HTTPS 포함 — EDITION 무관)", () => {
    expect(shouldUseSecureCookie({ DASHBOARD_URL: "https://cs.example.com" })).toBe(true);
    expect(shouldUseSecureCookie({ DASHBOARD_URL: "https://cs.example.com/sub/path" })).toBe(true);
  });

  it("http 오리진(로컬 개발)이면 Secure를 붙이지 않는다 — 붙이면 쿠키가 저장되지 않아 로그인이 막힌다", () => {
    expect(shouldUseSecureCookie({ DASHBOARD_URL: "http://localhost" })).toBe(false);
    expect(shouldUseSecureCookie({ DASHBOARD_URL: "http://localhost:3000" })).toBe(false);
  });

  it("파싱 불가한 값이면 false로 폴백한다", () => {
    expect(shouldUseSecureCookie({ DASHBOARD_URL: "not-a-url" })).toBe(false);
  });
});
