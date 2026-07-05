/**
 * Shadow DOM 내부 인라인 스타일 — 06_WIDGET_SPEC.md §2.
 * 호스트 CSS 영향 차단을 위해 모든 요소를 명시적으로 스타일링한다.
 * 색상은 --od-primary만 동적(widgetSettings.primaryColor), 나머지는 고정 팔레트.
 */
export const WIDGET_CSS = `
:host, * { box-sizing: border-box; }
.od-root {
  --od-primary: #4F46E5;
  --od-bg: #ffffff;
  --od-fg: #1f2430;
  --od-muted: #6b7280;
  --od-border: #e5e7eb;
  --od-visitor-bg: var(--od-primary);
  --od-visitor-fg: #ffffff;
  --od-other-bg: #f3f4f6;
  --od-other-fg: #1f2430;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--od-fg);
}
.od-launcher {
  position: fixed;
  bottom: 20px;
  z-index: 2147483000;
  width: 56px; height: 56px;
  border: none; border-radius: 9999px;
  background: var(--od-primary); color: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  transition: transform .12s ease;
}
.od-launcher:hover { transform: scale(1.05); }
.od-launcher.od-right { right: 20px; }
.od-launcher.od-left { left: 20px; }
.od-launcher svg { width: 26px; height: 26px; }
.od-badge {
  position: absolute; top: -2px; right: -2px;
  min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 10px; background: #ef4444; color: #fff;
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.od-window {
  position: fixed;
  bottom: 20px;
  z-index: 2147483000;
  width: 380px; height: 640px;
  max-height: calc(100vh - 40px);
  background: var(--od-bg);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.22);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.od-window.od-right { right: 20px; }
.od-window.od-left { left: 20px; }
.od-header {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 16px;
  background: var(--od-primary); color: #fff;
  flex: 0 0 auto;
}
.od-header .od-title { font-weight: 600; font-size: 15px; flex: 1 1 auto; }
.od-header button {
  background: transparent; border: none; color: #fff;
  cursor: pointer; padding: 6px; border-radius: 8px;
  display: flex; align-items: center;
}
.od-header button:hover { background: rgba(255,255,255,0.16); }
.od-header svg { width: 20px; height: 20px; }
.od-statusbar {
  padding: 6px 16px; font-size: 12px;
  background: #fef3c7; color: #92400e;
  flex: 0 0 auto;
}
.od-list {
  flex: 1 1 auto; overflow-y: auto;
  padding: 16px; display: flex; flex-direction: column; gap: 8px;
  background: #fafafa;
}
.od-datebar {
  align-self: center; font-size: 11px; color: var(--od-muted);
  background: #eceef1; padding: 2px 10px; border-radius: 10px; margin: 6px 0;
}
.od-row { display: flex; }
.od-row.od-visitor { justify-content: flex-end; }
.od-row.od-other { justify-content: flex-start; }
.od-row.od-system { justify-content: center; }
.od-bubble {
  max-width: 78%; padding: 9px 13px; border-radius: 14px;
  white-space: pre-wrap; word-break: break-word;
}
.od-visitor .od-bubble { background: var(--od-visitor-bg); color: var(--od-visitor-fg); border-bottom-right-radius: 4px; }
.od-other .od-bubble { background: var(--od-other-bg); color: var(--od-other-fg); border-bottom-left-radius: 4px; }
.od-bubble.od-pending { opacity: 0.65; }
.od-bubble.od-failed { background: #fee2e2; color: #991b1b; }
.od-system-line {
  font-size: 12.5px; color: var(--od-muted);
  background: #eef0f3; padding: 6px 12px; border-radius: 10px; text-align: center;
  max-width: 90%;
}
.od-meta { font-size: 11px; color: var(--od-muted); margin-top: 2px; text-align: right; }
.od-retry { background: none; border: none; color: #2563eb; cursor: pointer; font-size: 11px; padding: 0; margin-left: 6px; }
.od-read { color: var(--od-primary); margin-left: 6px; }
.od-typing { display: flex; gap: 4px; padding: 8px 12px; }
.od-typing span {
  width: 6px; height: 6px; border-radius: 50%; background: var(--od-muted);
  animation: od-blink 1.2s infinite ease-in-out;
}
.od-typing span:nth-child(2) { animation-delay: .2s; }
.od-typing span:nth-child(3) { animation-delay: .4s; }
@keyframes od-blink { 0%,80%,100% { opacity: .3; } 40% { opacity: 1; } }
.od-quick { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 16px 0; }
.od-quick button {
  border: 1px solid var(--od-primary); color: var(--od-primary);
  background: #fff; border-radius: 16px; padding: 6px 12px;
  cursor: pointer; font-size: 13px;
}
.od-quick button:hover { background: rgba(79,70,229,0.08); }
.od-emailprompt {
  border-top: 1px solid var(--od-border); padding: 12px 16px; background: #fff;
  display: flex; flex-direction: column; gap: 8px;
}
.od-emailprompt .od-eptitle { font-size: 13px; color: var(--od-fg); }
.od-emailprompt .od-eprow { display: flex; gap: 8px; }
.od-emailprompt input {
  flex: 1 1 auto; border: 1px solid var(--od-border); border-radius: 8px;
  padding: 8px 10px; font-size: 14px; font-family: inherit;
}
.od-emailprompt .od-ep-save { background: var(--od-primary); color: #fff; border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
.od-emailprompt .od-ep-skip { background: none; border: none; color: var(--od-muted); cursor: pointer; font-size: 12px; align-self: flex-start; }
.od-composer {
  display: flex; align-items: flex-end; gap: 8px;
  padding: 12px 16px; border-top: 1px solid var(--od-border); background: #fff;
  flex: 0 0 auto;
}
.od-composer textarea {
  flex: 1 1 auto; resize: none; border: 1px solid var(--od-border);
  border-radius: 12px; padding: 10px 12px; font-size: 14px; font-family: inherit;
  line-height: 1.4; max-height: 120px; outline: none;
}
.od-composer textarea:focus { border-color: var(--od-primary); }
.od-composer .od-send {
  background: var(--od-primary); color: #fff; border: none; border-radius: 10px;
  width: 40px; height: 40px; cursor: pointer; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
}
.od-composer .od-send:disabled { opacity: 0.5; cursor: default; }
.od-composer svg { width: 20px; height: 20px; }
@media (max-width: 640px) {
  .od-window {
    inset: 0; width: 100%; height: 100%;
    max-height: 100%; border-radius: 0;
  }
  .od-window.od-vv { height: var(--od-vv-height, 100%); }
}
`;
