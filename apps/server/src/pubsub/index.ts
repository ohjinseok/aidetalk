/**
 * PubSubAdapter 팩토리 — PUBSUB_DRIVER env로 구현 선택(10_DEPLOYMENT.md §1).
 */
import type { Env } from "../env";
import { createMemoryPubSub, type ClosablePubSub } from "./memory";
import { createRedisPubSub } from "./redis";

export { channels, isAgentsChannel } from "./channels";
export type { ClosablePubSub } from "./memory";

/** env.PUBSUB_DRIVER에 따라 redis/memory PubSub 생성. */
export function createPubSub(env: Env): ClosablePubSub {
  if (env.PUBSUB_DRIVER === "memory") {
    return createMemoryPubSub();
  }
  // redis 드라이버는 env 검증(superRefine)에서 REDIS_URL 존재를 보장.
  return createRedisPubSub(env.REDIS_URL!);
}
