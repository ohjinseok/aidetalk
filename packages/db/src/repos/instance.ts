/**
 * instanceRepo — 인스턴스 단위 메타데이터. 03_DATA_MODEL.md §3, 10_DEPLOYMENT.md(텔레메트리).
 * 워크스페이스에 속하지 않는 전역 리소스라 workspaceId 인자가 없다(workspaceRepo.create/userRepo와
 * 동일한 예외 — repo-types.test.ts 참고).
 */
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { Database } from "../client";
import { agents } from "../schema/agents";
import { conversations } from "../schema/conversations";
import { instanceSettings } from "../schema/instance";
import { workspaces } from "../schema/workspaces";

const SINGLETON_ID = "singleton";

/** 텔레메트리 페이로드에 실리는 "개수만" — 절대 내용/PII를 포함하지 않는다. */
export interface InstanceCounts {
  workspaces: number;
  conversations: number;
  agents: number;
}

export function makeInstanceRepo(db: Database) {
  return {
    /**
     * 인스턴스 익명 ID — 없으면 랜덤 생성해 저장하고, 있으면 그대로 반환.
     * 텔레메트리 전용 식별자(PII 아님, 재설치 시 새로 생성됨).
     */
    async getOrCreateAnonymousId(): Promise<string> {
      const [existing] = await db
        .select()
        .from(instanceSettings)
        .where(eq(instanceSettings.id, SINGLETON_ID));
      if (existing) return existing.anonymousId;

      // 03 문서의 prefix+nanoid 규칙은 엔티티 primary key용 — anonymousId는 FK 대상이 아닌
      // 순수 opaque 랜덤 토큰이라 접두어 없이 생성한다(길게: 32자).
      const anonymousId = nanoid(32);
      const inserted = await db
        .insert(instanceSettings)
        .values({ id: SINGLETON_ID, anonymousId })
        .onConflictDoNothing({ target: instanceSettings.id })
        .returning();
      if (inserted[0]) return inserted[0].anonymousId;

      // 동시 부팅 경합 — 다른 프로세스가 먼저 넣은 값을 그대로 사용.
      const [row] = await db
        .select()
        .from(instanceSettings)
        .where(eq(instanceSettings.id, SINGLETON_ID));
      return row!.anonymousId;
    },

    /** 워크스페이스/대화/에이전트 전체 개수만 — 텔레메트리 페이로드용(내용/PII 없음). */
    async getCounts(): Promise<InstanceCounts> {
      const [[w], [c], [a]] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(workspaces),
        db.select({ count: sql<number>`count(*)::int` }).from(conversations),
        db.select({ count: sql<number>`count(*)::int` }).from(agents),
      ]);
      return {
        workspaces: w?.count ?? 0,
        conversations: c?.count ?? 0,
        agents: a?.count ?? 0,
      };
    },
  };
}

export type InstanceRepo = ReturnType<typeof makeInstanceRepo>;
