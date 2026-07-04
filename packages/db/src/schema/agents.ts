/**
 * agents — 유저의 AI 커넥터(외부 HTTP endpoint). 03_DATA_MODEL.md §2.
 * secret 원문은 저장하지 않는다. secretHash = sha256(secret) 만 저장.
 */
import { pgTable, text, integer, boolean, index } from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_helpers";
import { workspaces } from "./workspaces";

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(), // agt_
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    endpointUrl: text("endpoint_url").notNull(), // 클라우드: https 필수
    secretHash: text("secret_hash").notNull(), // sha256(secret). 원문은 생성 시 1회 노출
    status: text("status").notNull().default("active"), // 'active' | 'disabled' | 'auto_disabled'
    failureCount: integer("failure_count").notNull().default(0), // reply 연속 실패, 성공 시 0
    timeoutMs: integer("timeout_ms").notNull().default(30000),
    assistEnabled: boolean("assist_enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // workspace당 status=active 인 agent는 최대 1개 (코드 레벨 제약 — agentRepo.create/setStatus에서 강제)
  (t) => [index("agt_ws_status").on(t.workspaceId, t.status)],
);
