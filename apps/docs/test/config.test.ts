import { describe, expect, it } from "vitest";
import config from "../.vitepress/config";

// 문서 사이트 최소 스모크 테스트.
// - 기본(ko)/en 로케일이 둘 다 정의되어 있는지
// - 완전 번역 대상 3페이지(홈/설치/Agent Protocol)의 en 사이드바 링크가 존재하는지
// 를 확인해, 로케일 구조가 깨진 채로 배포되는 것을 막는다.
describe("vitepress config", () => {
  it("defines both ko(root) and en locales", () => {
    expect(config.locales?.root?.lang).toBe("ko");
    expect(config.locales?.en?.lang).toBe("en");
  });

  it("exposes the fully-translated en pages in the en sidebar", () => {
    const sidebar = config.locales?.en?.themeConfig?.sidebar as Record<
      string,
      { items: { link: string }[] }[]
    >;
    const links = sidebar["/en/guide/"]?.[0]?.items.map((item) => item.link) ?? [];

    expect(links).toContain("/en/guide/install");
    expect(links).toContain("/en/guide/agent-protocol");
  });

  it("uses dist as the build output dir to match turbo's cache outputs", () => {
    expect(config.outDir).toBe("dist");
  });
});
