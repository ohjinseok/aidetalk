/**
 * 로케일 목록/기본값 — 메인 엔트리(index)와 위젯 서브엔트리(widget)의 단일 출처.
 *
 * 두 엔트리가 같은 상수를 공유해 로케일 정의가 어긋나지 않게 한다.
 */
export const locales = ["ko", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ko";
