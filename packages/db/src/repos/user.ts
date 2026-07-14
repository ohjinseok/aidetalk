/**
 * userRepo — 03_DATA_MODEL.md §3.
 * users는 워크스페이스 밖 전역 리소스(auth). 따라서 workspaceId를 받지 않는다(문서 예외).
 */
import { newId } from "@aidetalk/shared";
import { eq, sql } from "drizzle-orm";

import type { Database } from "../client";
import { hashPassword, verifyPassword } from "../crypto";
import { users } from "../schema/auth";

export interface CreateUserInput {
  email: string;
  password: string; // 평문 — repo가 argon2id로 해시한다
  name: string;
}

export function makeUserRepo(db: Database) {
  return {
    /** 가입. password는 여기서 argon2id로 해시되어 password_hash에 저장. */
    async create(input: CreateUserInput) {
      const passwordHash = await hashPassword(input.password);
      const [row] = await db
        .insert(users)
        .values({
          id: newId("usr"),
          email: input.email,
          passwordHash,
          name: input.name,
        })
        .returning();
      return row!;
    },

    /**
     * 인스턴스 전체 유저 수 — 공개 가입 게이트의 부트스트랩 판정용(0명이면 첫 관리자 가입 허용).
     * 인스턴스 전역 카운트라 workspaceId를 받지 않는다(instanceRepo와 동일한 예외).
     */
    async countAll(): Promise<number> {
      const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
      return row?.count ?? 0;
    },

    async getByEmail(email: string) {
      const [row] = await db.select().from(users).where(eq(users.email, email));
      return row;
    },

    async getById(userId: string) {
      const [row] = await db.select().from(users).where(eq(users.id, userId));
      return row;
    },

    /** 로그인 검증. 성공 시 user 반환, 실패(미존재/불일치) 시 null. */
    async verifyPassword(email: string, password: string) {
      const [row] = await db.select().from(users).where(eq(users.email, email));
      if (!row) return null;
      const ok = await verifyPassword(password, row.passwordHash);
      return ok ? row : null;
    },
  };
}

export type UserRepo = ReturnType<typeof makeUserRepo>;
