/**
 * 임베드 로더 (widget.js) — 06_WIDGET_SPEC.md §1.1.
 *
 * 제약: ≤2KB gzipped, 의존성 0, 순수 JS. Preact/앱 코드를 절대 import하지 않는다.
 * 책임:
 *   1. window.AideTalk.workspaceId 확인 (없으면 console.warn 후 종료)
 *   2. URL의 at_l 파라미터 → POST /t/click 발사 + history.replaceState로 제거 (최우선)
 *   3. host div + Shadow DOM 생성 → 본체 app.js 비동기 로드
 *   4. 본체 로드 실패 시 조용히 무동작 (호스트 사이트에 에러를 던지지 않는다)
 *
 * 본체는 window.__AIDETALK_MOUNT__(shadowRoot, config)를 호출해 마운트한다.
 * 버전 n은 빌드 시 __WIDGET_VERSION__로 주입된다.
 */
import { parseAtL, stripAtLFromUrl } from "./tracking";

declare const __WIDGET_VERSION__: string;

interface AideTalkGlobal {
  workspaceId?: string;
  /** API/WS 베이스. 미지정 시 로더 스크립트 origin에서 유도. */
  serverUrl?: string;
  /** 본체 로드 후 채워지는 내부 필드 — 로더가 준비한 마운트 컨텍스트. */
  _shadow?: ShadowRoot;
  _host?: HTMLElement;
  _serverUrl?: string;
}

interface AideTalkWindow extends Window {
  AideTalk?: AideTalkGlobal;
  __AIDETALK_MOUNT__?: (shadow: ShadowRoot, config: AideTalkGlobal) => void;
}

(function boot(win: AideTalkWindow) {
  const config = win.AideTalk;
  if (!config || !config.workspaceId) {
    // 절대 throw 하지 않는다 — 호스트 페이지에 영향 금지.
    console.warn("[AideTalk] window.AideTalk.workspaceId 가 없어 위젯을 초기화하지 않습니다.");
    return;
  }

  // 로더 스크립트 origin = 서버 호스트. document.currentScript는 async 실행 시점엔
  // 이미 null일 수 있어, 명시적 serverUrl > currentScript > location.origin 순으로 유도.
  const scriptSrc =
    (document.currentScript as HTMLScriptElement | null)?.src ??
    findLoaderScriptSrc(win) ??
    win.location.origin;
  let serverUrl = config.serverUrl ?? "";
  if (!serverUrl) {
    try {
      serverUrl = new URL(scriptSrc, win.location.href).origin;
    } catch {
      serverUrl = win.location.origin;
    }
  }
  serverUrl = serverUrl.replace(/\/$/, "");

  // 2) 트래킹 클릭 보고 — 본체 로드와 무관하게 최우선. 유실 방지 위해 즉시 실행.
  reportClick(win, serverUrl);

  // 3) host div + Shadow DOM 생성.
  const host = document.createElement("div");
  host.setAttribute("data-aidetalk", "host");
  const shadow = host.attachShadow({ mode: "open" });
  document.body.appendChild(host);

  config._shadow = shadow;
  config._host = host;
  config._serverUrl = serverUrl;

  // 3) 본체 비동기 로드.
  const appScript = document.createElement("script");
  appScript.async = true;
  appScript.src = `${serverUrl}/widget/v${__WIDGET_VERSION__}/app.js`;
  appScript.onload = () => {
    try {
      win.__AIDETALK_MOUNT__?.(shadow, config);
    } catch {
      // 4) 마운트 실패도 조용히 무시.
    }
  };
  // 4) 로드 실패 시 조용히 무동작.
  appScript.onerror = () => {
    /* no-op */
  };
  document.head.appendChild(appScript);
})(window as AideTalkWindow);

/** at_l 클릭 보고. sendBeacon 우선, 실패 시 keepalive fetch. 어떤 경우도 throw 하지 않는다. */
function reportClick(win: AideTalkWindow, serverUrl: string): void {
  try {
    const token = parseAtL(win.location.href);
    if (!token) return;

    const url = `${serverUrl}/t/click`;
    const body = JSON.stringify({ token });
    let sent = false;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      sent = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    }
    if (!sent && typeof fetch === "function") {
      // keepalive: 페이지 이탈에도 전송 보장. 응답/에러 무시.
      void fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
        mode: "cors",
      }).catch(() => {});
    }

    // 파라미터 제거 — 새로고침/공유 시 재보고 방지.
    const cleaned = stripAtLFromUrl(win.location.href);
    if (cleaned !== win.location.href && win.history?.replaceState) {
      win.history.replaceState(win.history.state, "", cleaned);
    }
  } catch {
    /* 트래킹 실패는 절대 호스트 페이지에 영향 주지 않는다 */
  }
}

/** currentScript가 null일 때 DOM에서 로더 script 태그를 역추적한다. */
function findLoaderScriptSrc(win: AideTalkWindow): string | null {
  const scripts = win.document.getElementsByTagName("script");
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i]?.src ?? "";
    if (src.indexOf("/widget.js") !== -1) return src;
  }
  return null;
}
