/**
 * 위젯 정적 자산 경로 계약 (06_WIDGET_SPEC.md §1, §1.1) — 로더·본체·서버가 공유하는 단일 출처.
 *
 * 임베드 스니펫은 `https://{host}/widget.js`(로더)를 부르고, 로더는 빌드 시 주입된 버전으로
 * `https://{host}/widget/v{n}/app.js`(본체)를 로드한다. 서버는 같은 버전 경로만 서빙한다.
 * 버전을 올리면(예: "2") 로더 번들과 서버 라우트가 동시에 따라가므로 경로 불일치가 생기지 않는다.
 */

/** 위젯 번들 버전 n — 본체 경로 `/widget/v{n}/app.js`에 쓰인다. */
export const WIDGET_VERSION = "1";

/** 로더 스크립트 경로(임베드 스니펫이 가리키는 URL). 짧은 캐시(max-age=300). */
export const WIDGET_LOADER_PATH = "/widget.js";

/** 본체 경로. 버전이 URL에 박혀 있으므로 불변 자산(immutable, 장기 캐시). */
export function widgetAppPath(version: string = WIDGET_VERSION): string {
  return `/widget/v${version}/app.js`;
}
