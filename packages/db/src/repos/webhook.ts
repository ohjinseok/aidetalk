/**
 * webhookRepo — webhooks(Should). 03_DATA_MODEL.md §3.
 * secret 원문은 저장하지 않고 sha256 해시만 저장(규칙 5).
 */
import { newId } from "@aidetalk/shared";
import { and, eq } from "drizzle-orm";

import type { Database } from "../client";
import { hashSecret } from "../crypto";
import { webhooks } from "../schema/webhooks";

export interface CreateWebhookInput {
  url: string;
  events: string[]; // ["conversation.created", "conversation.closed"]
  secret: string; // 평문 — repo가 sha256 해시화
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
          status: "active",
        })
        .returning();
      return row!;
    },

    async list(workspaceId: string) {
      return db.select().from(webhooks).where(eq(webhooks.workspaceId, workspaceId));
    },

    async remove(workspaceId: string, webhookId: string) {
      await db
        .delete(webhooks)
        .where(and(eq(webhooks.workspaceId, workspaceId), eq(webhooks.id, webhookId)));
    },
  };
}

export type WebhookRepo = ReturnType<typeof makeWebhookRepo>;
