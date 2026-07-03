import { describe, expect, it } from "vitest";

import { defaultLocale, t } from "../index";

describe("@aidetalk/i18n", () => {
  it("기본 로케일은 ko이다", () => {
    expect(defaultLocale).toBe("ko");
  });

  it("ko 키 값을 반환한다", () => {
    expect(t("common.appName")).toBe("AideTalk");
    expect(t("common.appName", "ko")).toBe("AideTalk");
  });

  it("en 로케일로 조회하면 영문 값을 반환한다", () => {
    expect(t("common.welcome", "en")).toBe("Welcome to AideTalk");
  });
});
