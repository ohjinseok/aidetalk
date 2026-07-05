import { describe, expect, it } from "vitest";

import { widget as koWidget } from "../locales/ko.json";
import { t } from "../widget";

describe("@aidetalk/i18n/widget", () => {
  it("기본 로케일(ko) 위젯 키를 반환한다", () => {
    expect(t("widget.headerTitle")).toBe("고객 상담");
    expect(t("widget.aiLabel", "ko")).toBe("AI");
  });

  it("en 로케일로 조회하면 영문 값을 반환한다", () => {
    expect(t("widget.headerTitle", "en")).toBe("Support");
  });

  it("서브엔트리 키 집합이 로케일 json의 widget 섹션과 일치한다", () => {
    // 단일 출처(ko.json)에서 파생되므로 드리프트가 없어야 한다.
    expect(t("widget.errorGeneric").length).toBeGreaterThan(0);
    expect(Object.keys(koWidget)).toContain("errorConnection");
  });
});
