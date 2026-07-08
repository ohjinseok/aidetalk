/**
 * Web Storage 안전 접근 + 저장 키 — WidgetController에서 분리한 순수 헬퍼(06 §4).
 * private 모드/차단 환경에서 throw할 수 있어 항상 안전하게 감싼다.
 */

/** Web Storage 접근은 private 모드/차단 환경에서 throw할 수 있어 항상 안전하게 감싼다. */
export function storageOf(kind: "local" | "session"): Storage {
  return kind === "local" ? localStorage : sessionStorage;
}
export function safeStorageGet(kind: "local" | "session", key: string): string | null {
  try {
    return storageOf(kind).getItem(key);
  } catch {
    return null;
  }
}
export function safeStorageSet(kind: "local" | "session", key: string, value: string): void {
  try {
    storageOf(kind).setItem(key, value);
  } catch {
    /* private 모드 등 — 무시 */
  }
}

/** 워크스페이스별 방문자 토큰 저장 키. */
export function visitorTokenKey(workspaceId: string): string {
  return `od_vt_${workspaceId}`;
}
/** 워크스페이스별 위젯 열림 상태 저장 키. */
export function openStateKey(workspaceId: string): string {
  return `od_open_${workspaceId}`;
}
