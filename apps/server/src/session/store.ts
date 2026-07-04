/**
 * 상담원 세션 저장소 — 04_API_SPEC.md §2 (`sess:{id}` → userId, TTL 14일).
 * REDIS_URL 있으면 Redis, 없으면 in-memory(단일 프로세스). 쿠키 `od_session`이 이 id를 담는다.
 */
import { randomBytes } from "node:crypto";

import { Redis } from "ioredis";

/** 세션 TTL 14일(초). */
export const SESSION_TTL_SEC = 14 * 24 * 60 * 60;

export interface SessionStore {
  /** 세션 생성 → 세션 id 반환. */
  create(userId: string, ttlSec?: number): Promise<string>;
  /** 세션 조회 → userId 또는 null. */
  get(sessionId: string): Promise<string | null>;
  /** 세션 파기(로그아웃). */
  destroy(sessionId: string): Promise<void>;
  close(): Promise<void>;
}

function newSessionId(): string {
  return `sess_${randomBytes(24).toString("base64url")}`;
}

export function createRedisSessionStore(redisUrl: string): SessionStore {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return {
    async create(userId, ttlSec = SESSION_TTL_SEC) {
      const id = newSessionId();
      await redis.set(`sess:${id}`, userId, "EX", ttlSec);
      return id;
    },
    async get(sessionId) {
      return redis.get(`sess:${sessionId}`);
    },
    async destroy(sessionId) {
      await redis.del(`sess:${sessionId}`);
    },
    async close() {
      redis.disconnect();
    },
  };
}

export function createMemorySessionStore(): SessionStore {
  const store = new Map<string, { userId: string; expiresAt: number }>();
  return {
    async create(userId, ttlSec = SESSION_TTL_SEC) {
      const id = newSessionId();
      store.set(id, { userId, expiresAt: Date.now() + ttlSec * 1000 });
      return id;
    },
    async get(sessionId) {
      const entry = store.get(sessionId);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        store.delete(sessionId);
        return null;
      }
      return entry.userId;
    },
    async destroy(sessionId) {
      store.delete(sessionId);
    },
    async close() {
      store.clear();
    },
  };
}

/** REDIS_URL 있으면 redis, 없으면 in-memory. */
export function createSessionStore(redisUrl?: string): SessionStore {
  return redisUrl ? createRedisSessionStore(redisUrl) : createMemorySessionStore();
}
