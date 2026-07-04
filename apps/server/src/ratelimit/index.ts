/**
 * 레이트리밋 — 04_API_SPEC.md §0.2 (Redis 고정 윈도).
 * REDIS_URL 없으면 in-memory 폴백(단일 프로세스 전용).
 * 초과 시 호출측이 429 rate/limited로 응답. (트래킹류 /t/* 예외는 이번 범위 아님)
 */
import { Redis } from "ioredis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export interface RateLimiter {
  /**
   * key에 대해 windowSec 고정 윈도 안에서 limit회까지 허용.
   * 호출마다 카운트 +1하고 허용 여부를 반환.
   */
  hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult>;
  close(): Promise<void>;
}

/** Redis 고정 윈도: INCR + 최초 1회 EXPIRE. */
export function createRedisRateLimiter(redisUrl: string): RateLimiter {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return {
    async hit(key, limit, windowSec) {
      const bucket = Math.floor(Date.now() / 1000 / windowSec);
      const redisKey = `rl:${key}:${bucket}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.expire(redisKey, windowSec);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
    },
    async close() {
      redis.disconnect();
    },
  };
}

/** in-memory 고정 윈도(단일 프로세스). 만료된 버킷은 접근 시 정리. */
export function createMemoryRateLimiter(): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key, limit, windowSec) {
      const now = Date.now();
      const windowMs = windowSec * 1000;
      const resetAt = Math.floor(now / windowMs) * windowMs + windowMs;
      const bucketKey = `${key}:${resetAt}`;
      let b = buckets.get(bucketKey);
      if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt };
        buckets.set(bucketKey, b);
        // 가벼운 청소: 만료된 버킷 제거.
        for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      }
      b.count += 1;
      return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count) };
    },
    async close() {
      buckets.clear();
    },
  };
}

/** REDIS_URL 있으면 redis, 없으면 in-memory. */
export function createRateLimiter(redisUrl?: string): RateLimiter {
  return redisUrl ? createRedisRateLimiter(redisUrl) : createMemoryRateLimiter();
}
