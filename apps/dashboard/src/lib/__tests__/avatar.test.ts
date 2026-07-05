import { describe, expect, it } from "vitest";

import { avatarColors, avatarInitial, hashString, visitorAvatar } from "../avatar";

describe("avatar", () => {
  it("hashString은 결정적이고 비음수", () => {
    expect(hashString("conv_abc")).toBe(hashString("conv_abc"));
    expect(hashString("conv_abc")).toBeGreaterThanOrEqual(0);
    // 서로 다른 입력은 (일반적으로) 다른 해시
    expect(hashString("conv_abc")).not.toBe(hashString("conv_xyz"));
  });

  it("avatarColors는 유효한 hsl 쌍을 만들고 seed마다 고정", () => {
    const a = avatarColors("visitor_1");
    const b = avatarColors("visitor_1");
    expect(a).toEqual(b);
    expect(a.from).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    expect(a.to).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    // 다른 seed는 다른 시작색(hue)일 가능성이 높다
    expect(avatarColors("visitor_2").from).not.toBe(a.from);
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
    expect(av.from).toBe(avatarColors("conv_42").from);
    // label 생략 시 seed에서 이니셜
    expect(visitorAvatar("conv_42").initial).toBe("C");
  });
});
