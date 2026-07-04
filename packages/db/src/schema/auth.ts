/**
 * users / members — 인증 + 워크스페이스 멤버십. 03_DATA_MODEL.md §2.
 * users는 워크스페이스 밖 전역 리소스(멀티 워크스페이스 소속 가능).
 */
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";
import { workspaces } from "./workspaces";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // usr_
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // argon2id
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(), // mbr_
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(), // 'owner' | 'agent_member'
    status: text("status").notNull().default("active"), // 'invited' | 'active'
    inviteToken: text("invite_token"), // 초대 수락 전까지만 값 존재
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("members_ws_user").on(t.workspaceId, t.userId)],
);
