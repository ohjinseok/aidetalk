/**
 * 브라우저 환경 감지 — WidgetController에서 분리한 순수 헬퍼(06 §1).
 * 구형/차단 브라우저 대비 안전 래핑(실패 시 undefined).
 */

/** navigator.language 감지 — 구형 브라우저/차단 환경 대비 안전 래핑(실패 시 생략). */
export function detectLocale(): string | undefined {
  try {
    return navigator.language || undefined;
  } catch {
    return undefined;
  }
}
/** Intl.DateTimeFormat().resolvedOptions().timeZone 감지 — 미지원 브라우저 대비 안전 래핑. */
export function detectTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
