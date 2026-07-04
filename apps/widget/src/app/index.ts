/**
 * 본체 번들 진입점 (app.js). 06_WIDGET_SPEC.md §1.
 *
 * 로더가 Shadow DOM을 준비하고 이 스크립트를 로드한 뒤,
 * onload에서 window.__AIDETALK_MOUNT__(shadow, config)를 호출해 마운트한다.
 * 본체는 마운트 함수만 전역에 등록하고, 자체적으로 host를 만들지 않는다.
 */
import { mountApp } from "./mount";
import type { WidgetConfig } from "./types";

interface LoaderGlobal {
  workspaceId?: string;
  serverUrl?: string;
  _serverUrl?: string;
  _shadow?: ShadowRoot;
}

interface AideTalkWindow extends Window {
  AideTalk?: LoaderGlobal;
  __AIDETALK_MOUNT__?: (shadow: ShadowRoot, config: LoaderGlobal) => void;
}

function normalize(config: LoaderGlobal): WidgetConfig | null {
  if (!config.workspaceId) return null;
  const serverUrl = (config._serverUrl ?? config.serverUrl ?? location.origin).replace(/\/$/, "");
  return { workspaceId: config.workspaceId, serverUrl };
}

const w = window as AideTalkWindow;
const mounted = new WeakSet<ShadowRoot>();

w.__AIDETALK_MOUNT__ = (shadow, config) => {
  if (mounted.has(shadow)) return; // 중복 마운트 방지
  const normalized = normalize(config);
  if (!normalized) return;
  mounted.add(shadow);
  mountApp(shadow, normalized);
};

// 레이스: app.js 실행 시점에 로더가 이미 shadow를 준비해 뒀다면 즉시 마운트.
if (w.AideTalk?._shadow && w.AideTalk.workspaceId) {
  w.__AIDETALK_MOUNT__(w.AideTalk._shadow, w.AideTalk);
}
