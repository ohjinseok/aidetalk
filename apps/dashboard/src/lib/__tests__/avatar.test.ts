import { describe, expect, it } from "vitest";

import { avatarColor, avatarInitial, hashString, visitorAvatar } from "../avatar";

describe("avatar", () => {
  it("hashString은 결정적이고 비음수", () => {
    expect(hashString("conv_abc")).toBe(hashString("conv_abc"));
    expect(hashString("conv_abc")).toBeGreaterThanOrEqual(0);
    // 서로 다른 입력은 (일반적으로) 다른 해시
    expect(hashString("conv_abc")).not.toBe(hashString("conv_xyz"));
  });

  it("avatarColor는 유효한 hsl 단색을 만들고 seed마다 고정", () => {
    const a = avatarColor("visitor_1");
    expect(a).toBe(avatarColor("visitor_1"));
    expect(a).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    // 팔레트 분산 — 여러 seed 중 최소 둘 이상은 다른 색이어야 한다
    const colors = new Set(["v1", "v2", "v3", "v4", "v5", "v6"].map(avatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });

  it("avatarInitial은 첫 글자를 대문자로, 기호/공백은 건너뛴다", () => {
    expect(avatarInitial("김민수")).toBe("김");
    expect(avatarInitial("  alice")).toBe("A");
    expect(avatarInitial("@handle")).toBe("H");
    expect(avatarInitial("123")).toBe("1");
    expect(avatarInitial("")).toBe("?");
    expect(avatarInitial("   ")).toBe("?");
  });

  it("visitorAvatar는 label로 이니셜, seed로 색을 유도", () => {
    const av = visitorAvatar("conv_42", "박지현");
    expect(av.initial).toBe("박");
    expect(av.color).toBe(avatarColor("conv_42"));
    // label 생략 시 seed에서 이니셜
    expect(visitorAvatar("conv_42").initial).toBe("C");
  });
});
