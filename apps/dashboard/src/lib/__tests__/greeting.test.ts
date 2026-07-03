import { describe, expect, it } from "vitest";

import { getWelcomeMessage } from "../greeting";

describe("getWelcomeMessage", () => {
  it("i18n ko 키에서 환영 문구를 가져온다", () => {
    expect(getWelcomeMessage()).toBe("AideTalk에 오신 것을 환영합니다");
  });
});
