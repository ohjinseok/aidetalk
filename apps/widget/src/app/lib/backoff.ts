/**
 * 지수 백오프 계산 — 06_WIDGET_SPEC.md §4.2.
 * 1s→2s→4s→8s→16s(최대), ±30% 지터.
 */
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 16000;
export const BACKOFF_JITTER = 0.3;

/**
 * attempt(0-based)에 대한 재연결 지연(ms).
 * @param attempt 0,1,2,... (0이 첫 재시도)
 * @param rng 지터용 난수 소스 [0,1) — 테스트 주입용, 기본 Math.random
 */
export function computeBackoff(attempt: number, rng: () => number = Math.random): number {
  const capped = Math.max(0, attempt);
  const base = Math.min(BACKOFF_BASE_MS * 2 ** capped, BACKOFF_MAX_MS);
  // ±30% 지터: base * (1 ± 0.3)
  const jitterFactor = 1 + (rng() * 2 - 1) * BACKOFF_JITTER;
  return Math.round(base * jitterFactor);
}
