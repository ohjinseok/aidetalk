/**
 * invites — 미가입 이메일 멤버 초대. 03_DATA_MODEL.md §2.
 * members는 user_id NOT NULL FK라 아직 가입하지 않은 이메일을 담을 수 없다.
 * 그래서 "이메일 + 역할 + 토큰"만 담는 별도 초대 행을 두고, 초대 대상이 가입/로그인해
 * 토큰을 수락하면 그때 members 행을 만든다.
 *
 * token은 원문을 저장하지 않고 sha256 해시(token_hash)만 저장한다(규칙 5). 원문은 inviteUrl로 1회 노출.
 */
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";
import { users } from "./auth";
import { workspaces } from "./workspaces";

export const invites = pgTable(
  "invites",
  {
    id: text("id").primaryKey(), // inv_
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    email: text("email").notNull(), // 초대 대상 이메일(미가입일 수 있음)
    role: text("role").notNull(), // 'owner' | 'agent_member'
    tokenHash: text("token_hash").notNull(), // sha256(raw token). 원문은 저장 금지(규칙 5)
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id), // 초대한 owner
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // 발급 + 7일
    acceptedAt: timestamp("accepted_at", { withTimezone: true }), // 수락 전 null(멱등/재수락 거부)
    createdAt: createdAt(),
  },
  (t) => [index("invites_ws_email").on(t.workspaceId, t.email)],
);
