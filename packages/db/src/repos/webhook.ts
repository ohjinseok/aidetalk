/**
 * webhookRepo — webhooks(Should). 03_DATA_MODEL.md §3.
 * secret 원문은 저장하지 않는다 — sha256 해시(비교/식별용) + AES-GCM 암호문(아웃바운드 서명용,
 * agents.secretEnc와 동일 패턴)만 저장한다(규칙 5).
 */
import { newId } from "@aidetalk/shared";
import { and, eq } from "drizzle-orm";

import type { Database } from "../client";
import { hashSecret } from "../crypto";
import { webhooks } from "../schema/webhooks";

export interface CreateWebhookInput {
  url: string;
  events: string[]; // ["agent.auto_disabled", "conversation.handoff"]
  secret: string; // 평문 — repo가 sha256 해시화 + 호출측이 넘긴 암호문 저장.
  secretEnc: string; // 서명용 원문의 AES-GCM 암호문(호출측이 secret-enc-key 파생키로 생성).
}

export function makeWebhookRepo(db: Database) {
  return {
    async create(workspaceId: string, input: CreateWebhookInput) {
      const [row] = await db
        .insert(webhooks)
        .values({
          id: newId("whk"),
          workspaceId,
          url: input.url,
          events: input.events,
          secretHash: hashSecret(input.secret),
          secretEnc: input.secretEnc,
          status: "active",
        })
        .returning();
      return row!;
    },

    async list(workspaceId: string) {
      return db.select().from(webhooks).where(eq(webhooks.workspaceId, workspaceId));
    },

    async getById(workspaceId: string, webhookId: string) {
      const [row] = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.workspaceId, workspaceId), eq(webhooks.id, webhookId)));
      return row;
    },

    /** 워크스페이스의 active 웹훅 중 지정 이벤트를 구독한 것만(발송기 조회용). */
    async listSubscribed(workspaceId: string, event: string) {
      const rows = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.workspaceId, workspaceId), eq(webhooks.status, "active")));
      return rows.filter((row) => (row.events as string[]).includes(event));
    },

    async remove(workspaceId: string, webhookId: string) {
      await db
        .delete(webhooks)
        .where(and(eq(webhooks.workspaceId, workspaceId), eq(webhooks.id, webhookId)));
    },
  };
}

export type WebhookRepo = ReturnType<typeof makeWebhookRepo>;
