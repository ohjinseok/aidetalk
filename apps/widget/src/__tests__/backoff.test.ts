import { describe, expect, it } from "vitest";

import { BACKOFF_MAX_MS, computeBackoff } from "../app/lib/backoff";

describe("app/lib/backoff — 지수 백오프 (06 §4.2)", () => {
  // rng=0.5 → jitterFactor=1 (지터 0), 순수 지수값 확인.
  const noJitter = () => 0.5;

  it("1s→2s→4s→8s→16s 지수 증가 (지터 0)", () => {
    expect(computeBackoff(0, noJitter)).toBe(1000);
    expect(computeBackoff(1, noJitter)).toBe(2000);
    expect(computeBackoff(2, noJitter)).toBe(4000);
    expect(computeBackoff(3, noJitter)).toBe(8000);
    expect(computeBackoff(4, noJitter)).toBe(16000);
  });

  it("최대 16s로 캡", () => {
    expect(computeBackoff(5, noJitter)).toBe(BACKOFF_MAX_MS);
    expect(computeBackoff(10, noJitter)).toBe(BACKOFF_MAX_MS);
  });

  it("지터는 ±30% 범위 안", () => {
    // rng=0 → -30%, rng≈1 → +30%
    expect(computeBackoff(1, () => 0)).toBe(1400); // 2000 * 0.7
    expect(computeBackoff(1, () => 1)).toBe(2600); // 2000 * 1.3
    for (let i = 0; i < 50; i++) {
      const v = computeBackoff(2, Math.random);
      expect(v).toBeGreaterThanOrEqual(4000 * 0.7);
      expect(v).toBeLessThanOrEqual(4000 * 1.3);
    }
  });

  it("음수 attempt는 0으로 처리", () => {
    expect(computeBackoff(-3, noJitter)).toBe(1000);
  });
});
