/**
 * 위젯↔서버 통합 E2E — 06_WIDGET_SPEC.md §8의 5개 시나리오(09 §7 필수).
 * headless Chromium. 서버/스텁 에이전트/정적 호스트/Postgres는 globalSetup이 준비한다.
 *
 * 위젯은 open Shadow DOM 안에 렌더링되며 Playwright CSS 로케이터가 이를 관통한다.
 */
import { readFileSync } from "node:fs";

import { test, expect, type Page } from "@playwright/test";

import { RUNTIME_FILE, type Runtime } from "./config";

const rt = JSON.parse(readFileSync(RUNTIME_FILE, "utf8")) as Runtime;

/** 호스트 임베드 URL(workspaceId·serverUrl 주입). */
function hostUrl(path = "/host.html"): string {
  return `${rt.hostUrl}${path}?ws=${rt.workspaceId}&server=${encodeURIComponent(rt.serverUrl)}`;
}

// ---------- 로케이터 헬퍼(Shadow DOM 관통) ----------
const launcher = (p: Page) => p.locator(".od-launcher");
const composer = (p: Page) => p.locator(".od-composer textarea");
const systemLines = (p: Page) => p.locator(".od-system-line");
const visitorBubbles = (p: Page) => p.locator(".od-row.od-visitor .od-bubble");
const otherBubbles = (p: Page) => p.locator(".od-row.od-other .od-bubble");
const quickReply = (p: Page, text: string) =>
  p.locator(".od-quick button", { hasText: text });

/** 런처를 열고 부팅(인사말 노출)까지 대기. */
async function openWidget(p: Page): Promise<void> {
  await expect(launcher(p)).toBeVisible();
  await launcher(p).click();
  await expect(composer(p)).toBeVisible();
}

/** 컴포저에 입력 후 Enter 전송. */
async function send(p: Page, text: string): Promise<void> {
  await composer(p).fill(text);
  await composer(p).press("Enter");
}

/** 이메일 프롬프트가 뜨면 건너뛴다(첫 메시지 후 1회 노출 — 후속 조작 방해 방지). */
async function dismissEmailPrompt(p: Page): Promise<void> {
  const skip = p.locator(".od-ep-skip");
  if (await skip.count()) {
    await skip.first().click({ timeout: 2000 }).catch(() => undefined);
  }
}

test.describe("위젯 E2E (06 §8)", () => {
  // 시나리오 1: 정적 HTML 임베드 → 런처 → 메시지 전송 → 모의 에이전트 응답 수신.
  test("1. 첫 대화 성립 + AI 응답 수신", async ({ page }) => {
    await page.goto(hostUrl());
    await openWidget(page);

    // 인사말(widgetSettings.greeting)이 시스템 라인으로 노출된다.
    await expect(systemLines(page).filter({ hasText: "무엇을 도와드릴까요?" })).toBeVisible();

    await send(page, "안녕하세요");
    await expect(visitorBubbles(page).filter({ hasText: "안녕하세요" })).toBeVisible();

    // 스텁 에이전트의 reply 수신.
    await expect(otherBubbles(page).filter({ hasText: "자동 응답: 안녕하세요" })).toBeVisible();
  });

  // 시나리오 2: (Next.js 대체) SPA 클라이언트 라우팅 3회 후에도 대화 유지.
  // 위젯은 한 번 마운트되면 URL 변화와 무관하게 유지된다(06 §3).
  test("2. SPA 라우팅 3회 후 대화 유지", async ({ page }) => {
    await page.goto(hostUrl());
    await openWidget(page);
    await send(page, "라우팅 테스트");
    await expect(otherBubbles(page).filter({ hasText: "자동 응답: 라우팅 테스트" })).toBeVisible();
    await dismissEmailPrompt(page);

    for (const path of ["/products/1", "/cart", "/checkout"]) {
      await page.evaluate((p) => (window as unknown as { __spaNavigate: (p: string) => void }).__spaNavigate(p), path);
    }
    await expect(page.locator("#route-label")).toHaveText("route: /checkout");

    // 위젯은 여전히 열려 있고 메시지가 유지된다(재마운트 없음).
    await expect(composer(page)).toBeVisible();
    await expect(visitorBubbles(page).filter({ hasText: "라우팅 테스트" })).toBeVisible();
    await expect(otherBubbles(page).filter({ hasText: "자동 응답: 라우팅 테스트" })).toBeVisible();
  });

  // 시나리오 3: 오프라인 중 전송 2건 → 온라인 복귀 → 유실 0·중복 0·순서 유지(06 §4.1).
  test("3. 오프라인 전송 후 재연결 동기화 — 유실0·중복0·순서", async ({ page, context }) => {
    await page.goto(hostUrl());
    await openWidget(page);

    // 온라인에서 대화 성립(첫 메시지로 conversation 생성).
    await send(page, "첫번째");
    await expect(otherBubbles(page).filter({ hasText: "자동 응답: 첫번째" })).toBeVisible();
    await dismissEmailPrompt(page);

    // 오프라인 전환 후 2건 전송.
    await context.setOffline(true);
    await send(page, "오프라인1");
    await send(page, "오프라인2");
    // 오프라인 동안 pending 말풍선으로 표시된다.
    await expect(visitorBubbles(page).filter({ hasText: "오프라인1" })).toBeVisible();

    await page.waitForTimeout(1500);

    // 온라인 복귀 + 즉시 재연결(visibilitychange — iOS 복귀 경로, 06 §4.2).
    await context.setOffline(false);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

    // 두 오프라인 메시지가 모두 서버에 도달해 AI 응답이 온다(유실 0).
    await expect(otherBubbles(page).filter({ hasText: "자동 응답: 오프라인1" })).toBeVisible();
    await expect(otherBubbles(page).filter({ hasText: "자동 응답: 오프라인2" })).toBeVisible();

    // 중복 0: 각 방문자 메시지는 정확히 1건.
    await expect(visitorBubbles(page).filter({ hasText: "오프라인1" })).toHaveCount(1);
    await expect(visitorBubbles(page).filter({ hasText: "오프라인2" })).toHaveCount(1);
    await expect(visitorBubbles(page).filter({ hasText: "첫번째" })).toHaveCount(1);

    // 순서 유지: 첫번째 < 오프라인1 < 오프라인2.
    const texts = await visitorBubbles(page).allInnerTexts();
    const idx = (s: string) => texts.findIndex((t) => t.includes(s));
    expect(idx("첫번째")).toBeGreaterThanOrEqual(0);
    expect(idx("첫번째")).toBeLessThan(idx("오프라인1"));
    expect(idx("오프라인1")).toBeLessThan(idx("오프라인2"));
  });

  // 시나리오 4: 새로고침 후 동일 대화 복원(session.openConversationId + GET messages).
  test("4. 새로고침 후 대화 복원", async ({ page }) => {
    await page.goto(hostUrl());
    await openWidget(page);
    await send(page, "복원 테스트");
    await expect(otherBubbles(page).filter({ hasText: "자동 응답: 복원 테스트" })).toBeVisible();
    await dismissEmailPrompt(page);

    await page.reload();

    // 이전에 열려 있었으므로(sessionStorage) 자동 재오픈 + 세션 복원.
    await expect(composer(page)).toBeVisible();
    await expect(visitorBubbles(page).filter({ hasText: "복원 테스트" })).toBeVisible();
    await expect(otherBubbles(page).filter({ hasText: "자동 응답: 복원 테스트" })).toBeVisible();
  });

  // 시나리오 5: quickReply "상담원 연결" → handoff → 시스템 라인 표시(06 §2, 04 §1).
  test("5. quickReply 핸드오프 후 시스템 라인 표시", async ({ page }) => {
    await page.goto(hostUrl());
    await openWidget(page);
    await send(page, "문의합니다");

    // 스텁 에이전트 reply의 quick_replies 버튼이 노출된다.
    await expect(quickReply(page, "상담원 연결")).toBeVisible();
    await dismissEmailPrompt(page);

    // 클릭 → "상담원 연결" 텍스트로 전송 → 에이전트 handoff → 손님 안내 system 메시지.
    await quickReply(page, "상담원 연결").click();
    await expect(visitorBubbles(page).filter({ hasText: "상담원 연결" })).toBeVisible();
    await expect(
      systemLines(page).filter({ hasText: "상담원을 연결해 드릴게요" }),
    ).toBeVisible();
  });
});
