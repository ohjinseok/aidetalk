/**
 * 위젯 번들 버전 — 산출물 경로 `/widget/v{n}/app.js`에 쓰인다(06 §1).
 * 본체(app.js)·로더(widget.js) 두 vite 설정이 공유하는 값이며, 빌드 시 __WIDGET_VERSION__로 주입된다.
 *
 * 계약상 단일 출처는 @aidetalk/shared의 WIDGET_VERSION(서버 정적 서빙 라우트가 쓰는 값)이지만,
 * vite의 config 로더는 bare import(@aidetalk/shared → TS 소스)를 external로 처리해 로드에 실패한다.
 * 그래서 여기서는 리터럴을 두고, 두 값이 어긋나면 실패하는 가드 테스트를 둔다
 * (src/loader/__tests__/version.test.ts). 버전을 올릴 땐 두 곳을 함께 고친다.
 */
export const WIDGET_VERSION = "1";
