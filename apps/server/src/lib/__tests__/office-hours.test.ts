/**
 * officeHours 평가 경계 테스트 — 04 §1 / 03·06 문서 규칙.
 * 규칙: open<close → [open,close) / open>close → 자정 넘김([open,24:00)∪[00:00,close)) / open==close → 24시간.
 * tz는 Asia/Seoul(UTC+9, DST 없음)로 고정 — 로컬분 = UTC + 9h.
 */
import { describe, expect, it } from "vitest";

import { isOfficeHours } from "../widget-settings";

/** KST 로컬시각을 UTC Date로. Seoul은 UTC+9 상시. */
function kst(dateUtcIso: string): Date {
  return new Date(dateUtcIso);
}

function settings(rules: { days: number[]; open: string; close: string }[]) {
  return { officeHours: { enabled: true, tz: "Asia/Seoul", rules } };
}

describe("isOfficeHours — 미설정/비활성", () => {
  it("officeHours 없으면 항상 운영시간", () => {
    expect(isOfficeHours({}, new Date())).toBe(true);
  });
  it("enabled=false면 항상 운영시간", () => {
    expect(
      isOfficeHours({ officeHours: { enabled: false, tz: "Asia/Seoul", rules: [] } }, new Date()),
    ).toBe(true);
  });
  it("rules 비었으면 항상 운영시간", () => {
    expect(isOfficeHours(settings([]), new Date())).toBe(true);
  });
});

// 2026-06-15는 월요일(ISO weekday 1).
describe("open < close — [open, close) 반열림 (Mon 09:00~18:00)", () => {
  const s = settings([{ days: [1], open: "09:00", close: "18:00" }]);
  it("구간 내부 10:00 KST → true", () => {
    expect(isOfficeHours(s, kst("2026-06-15T01:00:00Z"))).toBe(true); // 10:00 KST Mon
  });
  it("open 경계 09:00 포함 → true", () => {
    expect(isOfficeHours(s, kst("2026-06-15T00:00:00Z"))).toBe(true); // 09:00 KST
  });
  it("close 경계 18:00 제외 → false", () => {
    expect(isOfficeHours(s, kst("2026-06-15T09:00:00Z"))).toBe(false); // 18:00 KST
  });
  it("open 직전 08:59 → false", () => {
    expect(isOfficeHours(s, kst("2026-06-14T23:59:00Z"))).toBe(false); // 08:59 KST Mon
  });
  it("다른 요일(화요일)은 규칙 없음 → false", () => {
    expect(isOfficeHours(s, kst("2026-06-16T01:00:00Z"))).toBe(false); // 10:00 KST Tue
  });
});

describe("open > close — 자정 넘김 [open,24:00)∪[00:00,close) (매일 22:00~02:00)", () => {
  const s = settings([{ days: [1, 2, 3, 4, 5, 6, 7], open: "22:00", close: "02:00" }]);
  it("자정 전 23:00 → true", () => {
    expect(isOfficeHours(s, kst("2026-06-15T14:00:00Z"))).toBe(true); // 23:00 KST Mon
  });
  it("자정 후 01:00 → true", () => {
    expect(isOfficeHours(s, kst("2026-06-15T16:00:00Z"))).toBe(true); // 01:00 KST Tue
  });
  it("open 경계 22:00 포함 → true", () => {
    expect(isOfficeHours(s, kst("2026-06-15T13:00:00Z"))).toBe(true); // 22:00 KST
  });
  it("close 경계 02:00 제외 → false", () => {
    expect(isOfficeHours(s, kst("2026-06-15T17:00:00Z"))).toBe(false); // 02:00 KST
  });
  it("낮 12:00 → false", () => {
    expect(isOfficeHours(s, kst("2026-06-15T03:00:00Z"))).toBe(false); // 12:00 KST
  });
});

describe("open == close — 24시간 영업", () => {
  const s = settings([{ days: [1], open: "09:00", close: "09:00" }]);
  it("해당 요일 아무 시각이나 → true", () => {
    expect(isOfficeHours(s, kst("2026-06-15T00:00:00Z"))).toBe(true); // 09:00 KST Mon
    expect(isOfficeHours(s, kst("2026-06-14T18:00:00Z"))).toBe(true); // 03:00 KST Mon
  });
  it("규칙 없는 요일은 false", () => {
    expect(isOfficeHours(s, kst("2026-06-16T03:00:00Z"))).toBe(false); // Tue
  });
});
