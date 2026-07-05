import { defineConfig } from "vitepress";

// AideTalk 공개 문서 사이트.
// 기본 로케일은 ko(루트 경로). en은 /en/ 하위에 병행 구조로 둔다.
// 완전 번역: 홈 / 설치 가이드 / Agent Protocol. 나머지(위젯 임베드, 예제 에이전트)는
// en 스텁 페이지에서 ko 원문으로 안내한다 (ROADMAP M2 "문서 사이트" 완료 기준).
export default defineConfig({
  title: "AideTalk Docs",
  description: "AideTalk — 오픈소스 CS 메신저 셀프호스팅/Agent Protocol/위젯 임베드 문서",
  lang: "ko",
  outDir: "dist",
  cleanUrls: true,
  lastUpdated: true,

  head: [["link", { rel: "icon", href: "/favicon.svg" }]],

  themeConfig: {
    logo: "/favicon.svg",
    search: {
      provider: "local",
    },
    socialLinks: [{ icon: "github", link: "https://github.com/aidetalk/aidetalk" }],
  },

  locales: {
    root: {
      label: "한국어",
      lang: "ko",
      title: "AideTalk Docs",
      description: "내 AI Agent를 5분 만에 내 사이트 채팅에",
      themeConfig: {
        nav: [
          { text: "홈", link: "/" },
          { text: "설치 가이드", link: "/guide/install" },
          { text: "Agent Protocol", link: "/guide/agent-protocol" },
          { text: "위젯 임베드", link: "/guide/widget-embed" },
          { text: "예제 에이전트", link: "/guide/examples" },
        ],
        sidebar: {
          "/guide/": [
            {
              text: "가이드",
              items: [
                { text: "셀프호스팅 설치 가이드", link: "/guide/install" },
                { text: "Agent Protocol", link: "/guide/agent-protocol" },
                { text: "위젯 임베드 가이드", link: "/guide/widget-embed" },
                { text: "예제 에이전트", link: "/guide/examples" },
              ],
            },
          ],
        },
        outline: { label: "이 페이지 목차" },
        docFooter: { prev: "이전 페이지", next: "다음 페이지" },
        returnToTopLabel: "맨 위로",
        darkModeSwitchLabel: "테마",
        sidebarMenuLabel: "메뉴",
        editLink: {
          pattern: "https://github.com/aidetalk/aidetalk/edit/main/apps/docs/:path",
          text: "이 페이지 편집 제안하기",
        },
      },
    },
    en: {
      label: "English",
      lang: "en",
      link: "/en/",
      title: "AideTalk Docs",
      description: "Connect your own AI Agent to your site's chat in 5 minutes",
      themeConfig: {
        nav: [
          { text: "Home", link: "/en/" },
          { text: "Install Guide", link: "/en/guide/install" },
          { text: "Agent Protocol", link: "/en/guide/agent-protocol" },
          { text: "Widget Embed", link: "/en/guide/widget-embed" },
          { text: "Example Agents", link: "/en/guide/examples" },
        ],
        sidebar: {
          "/en/guide/": [
            {
              text: "Guide",
              items: [
                { text: "Self-hosting Install Guide", link: "/en/guide/install" },
                { text: "Agent Protocol", link: "/en/guide/agent-protocol" },
                { text: "Widget Embed Guide", link: "/en/guide/widget-embed" },
                { text: "Example Agents", link: "/en/guide/examples" },
              ],
            },
          ],
        },
        editLink: {
          pattern: "https://github.com/aidetalk/aidetalk/edit/main/apps/docs/:path",
          text: "Suggest an edit to this page",
        },
      },
    },
  },
});
