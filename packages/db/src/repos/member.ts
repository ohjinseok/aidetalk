/**
 * memberRepo — 03_DATA_MODEL.md §3.
 */
import { newId } from "@aidetalk/shared";
import { and, eq } from "drizzle-orm";

import type { Database } from "../client";
import { members, users } from "../schema/auth";
import { workspaces } from "../schema/workspaces";

export interface InviteMemberInput {
  userId: string;
  role: "owner" | "agent_member";
  inviteToken?: string; // 없으면 자동 생성
}

export function makeMemberRepo(db: Database) {
  return {
    /** 워크스페이스 생성자(owner)를 즉시 active 멤버로 등록. 04 §2 POST /v1/workspaces. */
    async addActive(workspaceId: string, userId: string, role: "owner" | "agent_member") {
      const [row] = await db
        .insert(members)
        .values({
          id: newId("mbr"),
          workspaceId,
          userId,
          role,
          status: "active",
          inviteToken: null,
        })
        .returning();
      return row!;
    },

    /** 사용자가 속한 모든 워크스페이스 멤버십(GET /v1/me). 워크스페이스명 조인. */
    async listByUser(userId: string) {
      return db
        .select({
          workspaceId: members.workspaceId,
          workspaceName: workspaces.name,
          role: members.role,
          status: members.status,
        })
        .from(members)
        .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
        .where(eq(members.userId, userId));
    },

    /** 멤버 초대(status=invited, inviteToken 발급). */
    async invite(workspaceId: string, input: InviteMemberInput) {
      const [row] = await db
        .insert(members)
        .values({
          id: newId("mbr"),
          workspaceId,
          userId: input.userId,
          role: input.role,
          status: "invited",
          inviteToken: input.inviteToken ?? newId("mbr"),
        })
        .returning();
      return row!;
    },

    /** 초대 수락: status=active, inviteToken 제거. */
    async acceptInvite(workspaceId: string, inviteToken: string) {
      const [row] = await db
        .update(members)
        .set({ status: "active", inviteToken: null })
        .where(and(eq(members.workspaceId, workspaceId), eq(members.inviteToken, inviteToken)))
        .returning();
      return row;
    },

    /** 멤버 목록(users 조인 — 이름/이메일 포함). */
    async list(workspaceId: string) {
      return db
        .select({
          id: members.id,
          userId: members.userId,
          role: members.role,
          status: members.status,
          email: users.email,
          name: users.name,
          createdAt: members.createdAt,
        })
        .from(members)
        .innerJoin(users, eq(members.userId, users.id))
        .where(eq(members.workspaceId, workspaceId));
    },

    async remove(workspaceId: string, memberId: string) {
      await db
        .delete(members)
        .where(and(eq(members.workspaceId, workspaceId), eq(members.id, memberId)));
    },

    /** 워크스페이스 내 사용자의 role(권한 판정). 없으면 null. */
    async getRole(workspaceId: string, userId: string) {
      const [row] = await db
        .select({ role: members.role })
        .from(members)
        .where(and(eq(members.workspaceId, workspaceId), eq(members.userId, userId)));
      return row?.role ?? null;
    },
  };
}

export type MemberRepo = ReturnType<typeof makeMemberRepo>;
