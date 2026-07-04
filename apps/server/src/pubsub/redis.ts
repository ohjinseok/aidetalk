/**
 * Redis PubSubAdapter — 기본 드라이버(PUBSUB_DRIVER=redis).
 * ioredis는 subscribe 모드 커넥션에서 일반 명령을 못 쓰므로 pub/sub 커넥션을 분리한다.
 * 하나의 sub 커넥션에 채널을 다중 등록하고, 채널→핸들러 집합으로 라우팅(참조 카운트).
 */
import type { PubSubAdapter } from "@aidetalk/shared";
import { Redis } from "ioredis";

import type { ClosablePubSub } from "./memory";

export function createRedisPubSub(redisUrl: string): ClosablePubSub {
  const pub = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: null });
  const sub = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: null });

  const handlers = new Map<string, Set<(msg: string) => void>>();

  sub.on("message", (channel: string, message: string) => {
    const set = handlers.get(channel);
    if (!set) return;
    for (const handler of [...set]) handler(message);
  });

  const adapter: PubSubAdapter = {
    async publish(channel: string, msg: string): Promise<void> {
      await pub.publish(channel, msg);
    },

    async subscribe(channel: string, handler: (msg: string) => void): Promise<() => void> {
      let set = handlers.get(channel);
      if (!set) {
        set = new Set();
        handlers.set(channel, set);
        await sub.subscribe(channel);
      }
      set.add(handler);
      return () => {
        const s = handlers.get(channel);
        if (!s) return;
        s.delete(handler);
        if (s.size === 0) {
          handlers.delete(channel);
          // fire-and-forget: 구독 해제 실패는 치명적이지 않다.
          void sub.unsubscribe(channel).catch(() => {});
        }
      };
    },
  };

  return {
    ...adapter,
    async close(): Promise<void> {
      handlers.clear();
      pub.disconnect();
      sub.disconnect();
    },
  };
}
