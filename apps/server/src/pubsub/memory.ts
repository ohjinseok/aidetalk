/**
 * in-memory PubSubAdapter — 단일 프로세스 전용(PUBSUB_DRIVER=memory).
 * 02_ARCHITECTURE.md §1-1: 다중 인스턴스에서는 fan-out이 깨지므로 문서로만 경고.
 * 핸들러 호출은 microtask로 비동기화해 publish 호출자와 재진입을 분리한다.
 */
import type { PubSubAdapter } from "@aidetalk/shared";

export interface ClosablePubSub extends PubSubAdapter {
  close(): Promise<void>;
}

export function createMemoryPubSub(): ClosablePubSub {
  const handlers = new Map<string, Set<(msg: string) => void>>();

  return {
    async publish(channel: string, msg: string): Promise<void> {
      const set = handlers.get(channel);
      if (!set || set.size === 0) return;
      // 스냅샷 순회(핸들러 내 unsubscribe로 인한 변형 방지).
      for (const handler of [...set]) {
        queueMicrotask(() => handler(msg));
      }
    },

    async subscribe(channel: string, handler: (msg: string) => void): Promise<() => void> {
      let set = handlers.get(channel);
      if (!set) {
        set = new Set();
        handlers.set(channel, set);
      }
      set.add(handler);
      return () => {
        const s = handlers.get(channel);
        if (!s) return;
        s.delete(handler);
        if (s.size === 0) handlers.delete(channel);
      };
    },

    async close(): Promise<void> {
      handlers.clear();
    },
  };
}
