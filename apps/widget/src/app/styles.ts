/**
 * Shadow DOM 내부 인라인 스타일 — 06_WIDGET_SPEC.md §2.
 * 호스트 CSS 영향 차단을 위해 모든 요소를 명시적으로 스타일링한다.
 * 색상은 --od-primary만 동적(widgetSettings.primaryColor), 나머지는 고정 뉴트럴(zinc) 팔레트.
 *
 * 디자인 언어(대시보드와 동일): 그라데이션·반짝이·이모지 금지, 보더 우선.
 * AI 화자는 타이포그래피 "AI" 모노그램 칩 + primary 아웃라인 버블로 투명하게 표기.
 * primary 반투명(아웃라인 배경/보더)은 color-mix로 계산하되, 미지원 브라우저용 고정 폴백을 먼저 선언한다.
 */
export const WIDGET_CSS = `
:host, * { box-sizing: border-box; }
.od-root {
  --od-primary: #4F46E5;
  --od-bg: #ffffff;
  --od-fg: #18181b;
  --od-muted: #71717a;
  --od-border: #e4e4e7;
  --od-subtle: #f4f4f5;
  --od-visitor-fg: #ffffff;
  --od-ai-bg: #f5f5ff;
  --od-ai-border: #c7c7f0;
  font-family: -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  letter-spacing: -0.01em;
  color: var(--od-fg);
}
/* primary 반투명 — 지원 시 동적 primary 기준으로 재계산(폴백 위에 덮어씀). */
@supports (background: color-mix(in srgb, red, blue)) {
  .od-root {
    --od-ai-bg: color-mix(in srgb, var(--od-primary) 6%, #ffffff);
    --od-ai-border: color-mix(in srgb, var(--od-primary) 28%, transparent);
  }
}

/* ── 런처 ─────────────────────────────────────────────── */
.od-launcher {
  position: fixed;
  bottom: 20px;
  z-index: 2147483000;
  width: 56px; height: 56px;
  border: none; border-radius: 9999px;
  background: var(--od-primary); color: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 20px rgba(0,0,0,0.18);
  transition: transform .14s ease, box-shadow .14s ease;
}
.od-launcher:hover { transform: scale(1.05); box-shadow: 0 8px 26px rgba(0,0,0,0.22); }
.od-launcher:active { transform: scale(0.97); }
.od-launcher:focus-visible { outline: 2px solid #18181b; outline-offset: 2px; }
.od-launcher.od-right { right: 20px; }
.od-launcher.od-left { left: 20px; }
.od-launcher svg { width: 26px; height: 26px; }
.od-badge {
  position: absolute; top: -2px; right: -2px;
  min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 10px; background: #ef4444; color: #fff;
  font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 0 2px #fff;
}

/* ── 패널 ─────────────────────────────────────────────── */
.od-window {
  position: fixed;
  /* 런처(56px, bottom 20px) 위로 12px 띄워 겹침 방지 */
  bottom: 88px;
  z-index: 2147483000;
  width: 380px; height: 640px;
  max-height: calc(100vh - 108px);
  background: var(--od-bg);
  border: 1px solid var(--od-border);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgb(0 0 0 / 0.16);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.od-window.od-right { right: 20px; }
.od-window.od-left { left: 20px; }

/* ── 헤더(흰 배경 + 보더, primary는 포인트로만) ───────────── */
.od-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px 12px 16px;
  background: var(--od-bg);
  border-bottom: 1px solid var(--od-border);
  flex: 0 0 auto;
}
.od-header .od-header-main {
  flex: 1 1 auto; min-width: 0;
  display: flex; flex-direction: column; gap: 1px;
}
.od-header .od-title {
  font-weight: 600; font-size: 15px; color: var(--od-fg);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.od-header .od-subtitle {
  font-size: 12px; color: var(--od-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.od-header .od-header-action {
  flex: 0 0 auto;
  background: var(--od-bg); color: var(--od-fg);
  border: 1px solid var(--od-border); border-radius: 8px;
  padding: 6px 10px; font-size: 12px; font-weight: 500; font-family: inherit;
  cursor: pointer;
}
.od-header .od-header-action:hover { background: var(--od-subtle); }
.od-header .od-iconbtn {
  flex: 0 0 auto;
  background: transparent; border: none; color: var(--od-muted);
  cursor: pointer; padding: 6px; border-radius: 8px;
  display: flex; align-items: center;
}
.od-header .od-iconbtn:hover { background: var(--od-subtle); color: var(--od-fg); }
.od-header .od-iconbtn:focus-visible { outline: 2px solid var(--od-primary); outline-offset: 1px; }
.od-header svg { width: 20px; height: 20px; }

.od-statusbar {
  padding: 6px 16px; font-size: 12px;
  background: #fef3c7; color: #92400e;
  border-bottom: 1px solid #fde68a;
  flex: 0 0 auto;
}

/* ── 대화 영역 ────────────────────────────────────────── */
.od-list {
  flex: 1 1 auto; overflow-y: auto;
  padding: 16px; display: flex; flex-direction: column; gap: 3px;
  background: var(--od-bg);
}
.od-datebar {
  align-self: center; font-size: 11px; color: var(--od-muted);
  font-variant-numeric: tabular-nums;
  background: var(--od-subtle); padding: 3px 10px; border-radius: 10px; margin: 8px 0 5px;
}
.od-row { display: flex; }
.od-row.od-hd { margin-top: 10px; }
.od-row.od-visitor { justify-content: flex-end; }
.od-row.od-other { justify-content: flex-start; }
.od-row.od-system { justify-content: center; margin: 4px 0; }

.od-bubble {
  max-width: 80%; padding: 9px 13px; border-radius: 16px;
  white-space: pre-wrap; word-break: break-word;
  border: 1px solid transparent;
}
/* 손님(나): 우측 primary 솔리드 */
.od-visitor .od-bubble {
  background: var(--od-primary); color: var(--od-visitor-fg);
  border-bottom-right-radius: 6px;
}
/* AI 자동응답: 좌측 primary 아웃라인 */
.od-other.od-ai .od-bubble {
  background: var(--od-ai-bg); color: var(--od-fg);
  border-color: var(--od-ai-border);
  border-bottom-left-radius: 6px;
}
/* 상담원(사람): 좌측 뉴트럴 */
.od-other.od-human .od-bubble {
  background: var(--od-subtle); color: var(--od-fg);
  border-bottom-left-radius: 6px;
}
.od-bubble.od-pending { opacity: 0.6; }
.od-bubble.od-failed { background: #fee2e2; color: #991b1b; border-color: #fecaca; }

/* "AI" 모노그램 칩 — 그룹 첫 버블 위. 반짝이/이모지 금지 방침. */
.od-aichip {
  display: inline-flex; align-items: center;
  border: 1px solid var(--od-ai-border); border-radius: 5px;
  padding: 0 4px; height: 16px;
  font-size: 10px; font-weight: 600; line-height: 1; color: var(--od-primary);
  margin-bottom: 4px;
}

.od-system-line {
  font-size: 12.5px; color: var(--od-muted);
  background: var(--od-subtle); padding: 7px 12px; border-radius: 12px; text-align: center;
  max-width: 92%;
}
.od-meta {
  font-size: 11px; color: var(--od-muted); margin-top: 3px;
  font-variant-numeric: tabular-nums;
}
.od-visitor .od-meta { text-align: right; }
.od-other .od-meta { text-align: left; }
.od-retry { background: none; border: none; color: var(--od-primary); cursor: pointer; font-size: 11px; padding: 0; margin-left: 6px; font-family: inherit; }
.od-read { color: var(--od-primary); margin-left: 6px; }

/* ── 타이핑 인디케이터 ─────────────────────────────────── */
.od-other-typing { padding: 8px 12px; }
.od-typing { display: flex; gap: 4px; }
.od-typing span {
  width: 6px; height: 6px; border-radius: 50%; background: var(--od-muted);
  animation: od-blink 1.2s infinite ease-in-out;
}
.od-typing span:nth-child(2) { animation-delay: .2s; }
.od-typing span:nth-child(3) { animation-delay: .4s; }
@keyframes od-blink { 0%,80%,100% { opacity: .3; } 40% { opacity: 1; } }

/* ── 빠른 답변 ────────────────────────────────────────── */
.od-quick { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 16px 0; }
.od-quick button {
  border: 1px solid var(--od-ai-border); color: var(--od-primary);
  background: var(--od-bg); border-radius: 16px; padding: 6px 12px;
  cursor: pointer; font-size: 13px; font-family: inherit;
}
.od-quick button:hover { background: var(--od-ai-bg); }
.od-quick button:focus-visible { outline: 2px solid var(--od-primary); outline-offset: 1px; }

/* ── 이메일 수집 ──────────────────────────────────────── */
.od-emailprompt {
  border-top: 1px solid var(--od-border); padding: 12px 16px; background: var(--od-bg);
  display: flex; flex-direction: column; gap: 8px;
}
.od-emailprompt .od-eptitle { font-size: 13px; color: var(--od-fg); }
.od-emailprompt .od-eprow { display: flex; gap: 8px; }
.od-emailprompt input {
  flex: 1 1 auto; border: 1px solid var(--od-border); border-radius: 8px;
  padding: 8px 10px; font-size: 14px; font-family: inherit; color: var(--od-fg);
  outline: none;
}
.od-emailprompt input:focus { border-color: var(--od-primary); }
.od-emailprompt .od-ep-save { background: var(--od-primary); color: #fff; border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-family: inherit; }
.od-emailprompt .od-ep-skip { background: none; border: none; color: var(--od-muted); cursor: pointer; font-size: 12px; align-self: flex-start; font-family: inherit; }

/* ── 입력줄 ───────────────────────────────────────────── */
.od-composer {
  display: flex; align-items: flex-end; gap: 8px;
  padding: 10px 12px 12px; border-top: 1px solid var(--od-border); background: var(--od-bg);
  flex: 0 0 auto;
}
.od-composer textarea {
  flex: 1 1 auto; resize: none; border: none; background: transparent;
  border-radius: 0; padding: 9px 6px; font-size: 14px; font-family: inherit;
  line-height: 1.4; max-height: 120px; outline: none; color: var(--od-fg);
}
.od-composer textarea::placeholder { color: var(--od-muted); }
.od-composer .od-send {
  background: var(--od-primary); color: #fff; border: none; border-radius: 12px;
  width: 40px; height: 40px; cursor: pointer; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
  transition: opacity .12s ease;
}
.od-composer .od-send:disabled { opacity: 0.4; cursor: default; }
.od-composer .od-send:focus-visible { outline: 2px solid #18181b; outline-offset: 2px; }
.od-composer svg { width: 20px; height: 20px; }

@media (max-width: 640px) {
  .od-window {
    inset: 0; width: 100%; height: 100%;
    max-height: 100%; border-radius: 0; border: none;
  }
  .od-window.od-vv { height: var(--od-vv-height, 100%); }
}
`;
