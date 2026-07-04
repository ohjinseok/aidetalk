import { describe, expect, it } from "vitest";

import { parseAtL, stripAtLFromUrl } from "../loader/tracking";

describe("loader/tracking — at_l 파싱/제거 (06 §1.1)", () => {
  it("at_l 값을 추출한다", () => {
    expect(parseAtL("https://shop.com/p/1?at_l=tlk_abc&x=1")).toBe("tlk_abc");
  });

  it("at_l 없으면 null", () => {
    expect(parseAtL("https://shop.com/p/1?x=1")).toBeNull();
    expect(parseAtL("https://shop.com/p/1")).toBeNull();
  });

  it("빈 at_l은 null", () => {
    expect(parseAtL("https://shop.com/p/1?at_l=")).toBeNull();
  });

  it("잘못된 URL은 null", () => {
    expect(parseAtL("not a url")).toBeNull();
  });

  it("at_l만 제거하고 다른 쿼리는 유지한다", () => {
    expect(stripAtLFromUrl("https://shop.com/p/1?at_l=tlk_abc&x=1&y=2")).toBe("/p/1?x=1&y=2");
  });

  it("at_l이 유일한 쿼리면 물음표까지 제거", () => {
    expect(stripAtLFromUrl("https://shop.com/p/1?at_l=tlk_abc")).toBe("/p/1");
  });

  it("해시를 보존한다", () => {
    expect(stripAtLFromUrl("https://shop.com/p/1?at_l=tlk_abc#sec")).toBe("/p/1#sec");
  });

  it("at_l 없으면 원본 그대로", () => {
    const url = "https://shop.com/p/1?x=1";
    expect(stripAtLFromUrl(url)).toBe(url);
  });
});
