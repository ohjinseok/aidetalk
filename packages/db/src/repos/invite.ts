/**
 * inviteRepo — 미가입 이메일 초대. 03_DATA_MODEL.md §3.
 * 규칙 11: workspace-scoped 변경 함수의 첫 인자는 workspaceId.
 * 토큰 조회(getByTokenHash)는 워크스페이스를 모르는 상태(수락 화면)라 token_hash 단일 인덱스 조회다
 * (userRepo.getByEmail / memberRepo.getByInviteToken과 동일한 03 §3 예외).
 */
import { newId } from "@aidetalk/shared";
import { and, eq, gt, isNull } from "drizzle-orm";

import type { Database } from "../client";
import { invites } from "../schema/invites";

/** 초대 만료 기간 — 7일. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreateInviteInput {
  email: string;
  role: "owner" | "agent_member";
  tokenHash: string; // sha256(raw token) — 원문은 저장 금지(규칙 5)
  invitedBy: string;
  expiresAt?: Date; // 기본 now + 7일
}

export function makeInviteRepo(db: Database) {
  return {
    /** 초대 생성(status=미수락). raw token은 호출측이 해시해 넘긴다. */
    async create(workspaceId: string, input: CreateInviteInput) {
      const [row] = await db
        .insert(invites)
        .values({
          id: newId("inv"),
          workspaceId,
          email: input.email,
          role: input.role,
          tokenHash: input.tokenHash,
          invitedBy: input.invitedBy,
          expiresAt: input.expiresAt ?? new Date(Date.now() + INVITE_TTL_MS),
          acceptedAt: null,
        })
        .returning();
      return row!;
    },

    /** token_hash로 초대 조회(수락 화면 — 워크스페이스 미지정). 없으면 undefined. */
    async getByTokenHash(tokenHash: string) {
      const [row] = await db.select().from(invites).where(eq(invites.tokenHash, tokenHash));
      return row;
    },

    /**
     * 해당 이메일로 아직 유효한(미수락·미만료) 초대가 있는지 — ALLOW_PUBLIC_SIGNUP=false일 때도
     * 초대받은 사람은 가입할 수 있어야 하므로 필요하다(auth 라우트의 가입 게이트).
     * 워크스페이스를 모르는 상태의 조회라 getByTokenHash와 동일하게 workspaceId를 받지 않는다.
     */
    async hasPendingByEmail(email: string): Promise<boolean> {
      const [row] = await db
        .select({ id: invites.id })
        .from(invites)
        .where(
          and(
            eq(invites.email, email),
            isNull(invites.acceptedAt),
            gt(invites.expiresAt, new Date()),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    /** 수락 처리(acceptedAt 기록). 이미 수락됐으면(acceptedAt not null) 갱신 없이 undefined 반환 → 재수락 거부. */
    async markAccepted(workspaceId: string, inviteId: string, at: Date = new Date()) {
      const [row] = await db
        .update(invites)
        .set({ acceptedAt: at })
        .where(
          and(
            eq(invites.workspaceId, workspaceId),
            eq(invites.id, inviteId),
            // acceptedAt IS NULL 조건으로 동시/재수락을 원자적으로 막는다.
            isNull(invites.acceptedAt),
          ),
        )
        .returning();
      return row;
    },
  };
}

export type InviteRepo = ReturnType<typeof makeInviteRepo>;
