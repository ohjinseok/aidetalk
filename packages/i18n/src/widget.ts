/**
 * 위젯 전용 i18n 서브엔트리 — `@aidetalk/i18n/widget`.
 *
 * 위젯은 `widget.*` 문자열만 쓰는데, 메인 엔트리(index)를 import하면 dashboard/errors/server
 * 섹션까지 번들에 통째로 실린다. 여기서는 로케일 json의 `widget` 섹션만 **named import**로
 * 가져와, 번들러가 나머지 섹션을 트리셰이킹으로 제거하게 한다.
 *
 * ko/en json이 여전히 단일 출처이므로(수동 복사본 없음) 드리프트가 불가능하다.
 * (트리셰이킹을 위해 위젯 vite 빌드는 `json.stringify: false`로 named export를 보존한다.)
 */
import { defaultLocale, type Locale } from "./locale";
import { widget as en } from "./locales/en.json";
import { widget as ko } from "./locales/ko.json";

type WidgetMessages = typeof ko;
const widgetMessages: Record<Locale, WidgetMessages> = { ko, en };

/** `widget.*` 형태만 허용하는 리터럴 유니온 — 메인 엔트리의 TranslationKey 중 위젯 부분집합. */
export type WidgetTranslationKey = `widget.${keyof WidgetMessages & string}`;

/**
 * 위젯 번역 문자열 조회. 지정 로케일에 값이 없으면 기본 로케일(ko)로 폴백,
 * 그마저 없으면 키 문자열 자체를 반환한다(개발 중 누락 감지 목적).
 */
export function t(key: WidgetTranslationKey, locale: Locale = defaultLocale): string {
  const field = key.slice("widget.".length) as keyof WidgetMessages;
  const table = widgetMessages[locale] ?? widgetMessages[defaultLocale];
  const value = table[field];
  if (typeof value === "string") return value;
  const fallback = widgetMessages[defaultLocale][field];
  return typeof fallback === "string" ? fallback : key;
}
