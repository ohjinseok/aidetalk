/**
 * packages/i18n — 로케일 리소스 + 타입 세이프 t() 헬퍼
 *
 * 기본 로케일은 ko. 모든 사용자 노출 문자열은 반드시 여기 등록된 키를 통해서만 노출한다
 * (CLAUDE.md 절대 규칙 4). 하드코딩 문자열 금지.
 */
import en from "./locales/en.json";
import ko from "./locales/ko.json";

export const locales = ["ko", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ko";

const messages = { ko, en } satisfies Record<Locale, unknown>;

type Messages = typeof ko;

/** 중첩 객체를 "a.b.c" 형태의 dot-path 리터럴 유니온으로 변환한다. */
type DotPaths<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${DotPaths<T[K]>}`;
    }[keyof T & string];

export type TranslationKey = DotPaths<Messages>;

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
