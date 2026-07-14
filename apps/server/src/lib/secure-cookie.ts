/**
 * 세션 쿠키의 Secure 플래그 판정 — 08_SECURITY.md §3.
 *
 * 예전에는 `EDITION === "cloud"`로 판정했는데, 이건 셀프호스팅 HTTPS 배포
 * (PUBLIC_URL=https://..., EDITION 비움)에서 Secure가 빠지는 결함이 있었다
 * (평문 유도 시 세션 쿠키 탈취 가능).
 *
 * 에디션이 아니라 **쿠키가 실제로 오가는 공개 오리진의 scheme**으로 판정한다.
 * 기준은 DASHBOARD_URL — od_session 쿠키는 대시보드 오리진에서만 설정/전송된다.
 * (단일 도메인 구성에서는 DASHBOARD_URL === PUBLIC_URL이다 — docker/compose.yml.)
 *
 * 로컬 http(://localhost) 구성에서는 false여야 브라우저가 쿠키를 저장하고 로그인이 된다.
 */
import type { Env } from "../env";

/** DASHBOARD_URL의 scheme이 https면 true(=쿠키에 Secure를 붙인다). */
export function shouldUseSecureCookie(env: Pick<Env, "DASHBOARD_URL">): boolean {
  try {
    return new URL(env.DASHBOARD_URL).protocol === "https:";
  } catch {
    // 파싱 불가한 값이면 안전한 쪽(Secure 미부착)으로 — 붙였다가 http에서 로그인 자체가 막히는 것보다
    // 낫다. env 검증(env.ts)이 정상 URL을 보장하므로 실제로는 도달하지 않는 경로다.
    return false;
  }
}
