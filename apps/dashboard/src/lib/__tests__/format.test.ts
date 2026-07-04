import { describe, expect, it } from "vitest";

import { formatHm, formatKrw, formatMessageTime, formatRelativeTime } from "../format";

describe("format", () => {
  const now = new Date("2026-07-03T15:30:00Z");

  it("오늘 시각은 HH:mm으로 표시한다", () => {
    // now와 동일 인스턴트 → 같은 로컬 날짜 보장(타임존 무관).
    const out = formatMessageTime(now.toISOString(), now, "ko");
    expect(out).toMatch(/^\d{2}:\d{2}$/);
  });

  it("다른 날짜는 'M월 d일'로 표시한다(ko)", () => {
    expect(formatMessageTime("2026-06-21T10:00:00Z", now, "ko")).toBe("6월 21일");
  });

  it("잘못된 날짜는 빈 문자열", () => {
    expect(formatMessageTime("not-a-date", now)).toBe("");
    expect(formatRelativeTime("nope", now)).toBe("");
    expect(formatHm("nope")).toBe("");
  });

  it("상대시간은 로컬라이즈된 문자열을 반환한다", () => {
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
    const out = formatRelativeTime(fiveMinAgo, now, "ko");
    expect(out).toContain("분");
  });

  it("원화 포맷", () => {
    expect(formatKrw(129000, "ko")).toContain("129,000");
  });
});
