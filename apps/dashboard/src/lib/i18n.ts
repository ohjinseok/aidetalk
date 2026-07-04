/**
 * 대시보드 i18n 헬퍼 — packages/i18n의 t()를 감싼다.
 * 기본 로케일 ko(CLAUDE.md 규칙 4). 모든 사용자 노출 문자열은 dashboard.* / errors.* 키를 통한다.
 *
 * - td(key): 번역 문자열 조회
 * - tf(key, vars): {name} 형태 플레이스홀더 치환
 */
import { defaultLocale, t, type Locale, type TranslationKey } from "@aidetalk/i18n";

export type DashLocale = Locale;

/** 단순 조회. */
export function td(key: TranslationKey, locale: Locale = defaultLocale): string {
  return t(key, locale);
}

/** {var} 플레이스홀더 치환 조회. */
export function tf(
  key: TranslationKey,
  vars: Record<string, string | number>,
  locale: Locale = defaultLocale,
): string {
  const raw = t(key, locale);
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

export type { TranslationKey };
