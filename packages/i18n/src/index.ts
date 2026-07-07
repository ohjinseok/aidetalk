/**
 * packages/i18n — 로케일 리소스 + 타입 세이프 t() 헬퍼
 *
 * 기본 로케일은 ko. 모든 사용자 노출 문자열은 반드시 여기 등록된 키를 통해서만 노출한다
 * (CLAUDE.md 절대 규칙 4). 하드코딩 문자열 금지.
 */
import { defaultLocale, locales, type Locale } from "./locale";
import type { TranslationKey } from "./keys.generated";
import en from "./locales/en.json";
import ko from "./locales/ko.json";

export { defaultLocale, locales };
export type { Locale };

const messages = { ko, en } satisfies Record<Locale, unknown>;

// TranslationKey는 코드젠(scripts/gen-keys.mjs → keys.generated.ts).
// 과거 DotPaths 재귀 템플릿 타입은 키 ~400개 부근에서 TS 유니온이 truncate돼
// 무관한 파일까지 typecheck가 전역 실패하는 문제가 있었다.
// ko.json 키 변경 시 `pnpm --filter @aidetalk/i18n gen:keys` 재실행(테스트가 동기화 강제).
export type { TranslationKey } from "./keys.generated";
export { translationKeys } from "./keys.generated";

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

/**
 * 번역 문자열 조회. 지정 로케일에 값이 없으면 기본 로케일(ko)로 폴백,
 * 그마저 없으면 키 문자열 자체를 반환한다(개발 중 누락 감지 목적).
 */
export function t(key: TranslationKey, locale: Locale = defaultLocale): string {
  const value = getByPath(messages[locale], key);
  if (typeof value === "string") return value;

  const fallback = getByPath(messages.ko, key);
  return typeof fallback === "string" ? fallback : key;
}

export { messages };
