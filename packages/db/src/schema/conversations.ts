/**
 * conversations — 대화. 03_DATA_MODEL.md §2.
 * mode = 'ai' | 'human'. agent 미등록 워크스페이스의 새 대화는 mode='human'으로 시작.
 */
import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_helpers";
import { visitors } from "./visitors";
import { workspaces } from "./workspaces";

/** metadata jsonb — { startPageUrl, referrer, uaSummary }. */
export type ConversationMetadata = Record<string, unknown>;

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(), // conv_
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id),
    status: text("status").notNull().default("open"), // 'open' | 'pending' | 'closed'
    mode: text("mode").notNull().default("ai"), // 'ai' | 'human' — 핸드오프 핵심 상태
    assigneeId: text("assignee_id"), // FK users, mode=human일 때 담당
    // ⚠️ 밀리초 정밀도(precision 3): messages.created_at과 정밀도를 맞춰
    //   (last_message_at, id) 키셋 커서가 마이크로초 잔차로 중복/누락되지 않게 한다(인박스 목록).
    lastMessageAt: timestamp("last_message_at", { withTimezone: true, precision: 3 }),
    // 양방향 읽음 표시(read receipts) — 각 주체가 읽음 처리한 마지막 메시지 id. 미읽음이면 null.
    // 비교는 id 정렬이 아니라 대상 메시지의 created_at으로 한다(msg_ nanoid는 단조 아님).
    visitorLastReadMessageId: text("visitor_last_read_message_id"),
    agentLastReadMessageId: text("agent_last_read_message_id"),
    metadata: jsonb("metadata").$type<ConversationMetadata>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("conv_inbox").on(t.workspaceId, t.status, t.lastMessageAt),
    // 담당자별 인박스 필터/카운트(assignee, byAssignee)용.
    index("conv_ws_assignee").on(t.workspaceId, t.assigneeId, t.status),
  ],
);
