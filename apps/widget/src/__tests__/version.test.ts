/**
 * 위젯 버전 동기화 가드.
 *
 * 로더는 빌드 시 주입된 버전으로 `/widget/v{n}/app.js`를 로드하고(06 §1.1),
 * 서버는 @aidetalk/shared의 WIDGET_VERSION으로 그 경로를 서빙한다.
 * vite config 로더 제약 때문에 apps/widget/version.ts는 리터럴을 유지하므로
 * (그 파일 주석 참고), 두 값이 어긋나면 위젯 본체가 404가 된다 — 여기서 막는다.
 */
import { WIDGET_VERSION as SHARED_WIDGET_VERSION } from "@aidetalk/shared";
import { describe, expect, it } from "vitest";

import { WIDGET_VERSION } from "../../version";

describe("WIDGET_VERSION", () => {
  it("shared의 계약 버전과 일치한다(불일치 시 본체 로드가 404)", () => {
    expect(WIDGET_VERSION).toBe(SHARED_WIDGET_VERSION);
  });
});
