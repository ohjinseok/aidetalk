/**
 * 트래킹 파라미터(at_l) 파싱/제거 — 06_WIDGET_SPEC.md §1.1.
 *
 * 로더에 인라인 번들되는 순수 함수(의존성 0). 단위 테스트 대상이라 별도 모듈로 분리한다.
 * `at_l`은 `POST /t/click`에 실을 tracked_link 토큰 값이다.
 */

/** URL 문자열에서 `at_l` 파라미터 값을 추출한다. 없으면 null. */
export function parseAtL(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    const value = url.searchParams.get("at_l");
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * URL에서 `at_l` 파라미터만 제거한 새 URL 문자열을 반환한다.
 * history.replaceState에 넣을 값(경로+쿼리+해시)만 만든다 — origin은 유지.
 */
export function stripAtLFromUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    if (!url.searchParams.has("at_l")) return urlStr;
    url.searchParams.delete("at_l");
    // pathname + (남은 쿼리) + hash. 쿼리가 비면 "?"를 남기지 않는다.
    const search = url.searchParams.toString();
    return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  } catch {
    return urlStr;
  }
}
