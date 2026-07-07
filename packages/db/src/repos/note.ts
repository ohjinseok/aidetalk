/**
 * noteRepo — 대화 내부 메모(상담원 전용). 03_DATA_MODEL.md §3.
 * 첫 인자 workspaceId(규칙 11). 대화 소유 검증을 내부에서 수행(멀티테넌트 격리).
 */
import { newId } from "@aidetalk/shared";
import { and, asc, eq } from "drizzle-orm";

import type { Database } from "../client";
import { users } from "../schema/auth";
import { conversationNotes } from "../schema/conversation-notes";
import { assertConversationOwned } from "./_shared";

export interface CreateNoteInput {
  authorId: string; // users.id
  body: string;
}

export interface UpdateNoteInput {
  body: string;
}

export function makeNoteRepo(db: Database) {
  return {
    /**
     * 대화의 메모 목록 — 작성자 이름(users 조인) 포함, createdAt 오름차순.
     * 작성자가 삭제된 경우 authorName은 null.
     */
    async listByConversation(workspaceId: string, conversationId: string) {
      await assertConversationOwned(db, workspaceId, conversationId);
      return db
        .select({
          id: conversationNotes.id,
          workspaceId: conversationNotes.workspaceId,
          conversationId: conversationNotes.conversationId,
          authorId: conversationNotes.authorId,
          authorName: users.name,
          body: conversationNotes.body,
          createdAt: conversationNotes.createdAt,
          updatedAt: conversationNotes.updatedAt,
        })
        .from(conversationNotes)
        .leftJoin(users, eq(users.id, conversationNotes.authorId))
        .where(
          and(
            eq(conversationNotes.workspaceId, workspaceId),
            eq(conversationNotes.conversationId, conversationId),
          ),
        )
        .orderBy(asc(conversationNotes.createdAt), asc(conversationNotes.id));
    },

    /** 메모 생성. 대화 소유 검증 후 삽입. */
    async create(workspaceId: string, conversationId: string, input: CreateNoteInput) {
      await assertConversationOwned(db, workspaceId, conversationId);
      const [row] = await db
        .insert(conversationNotes)
        .values({
          id: newId("note"),
          workspaceId,
          conversationId,
          authorId: input.authorId,
          body: input.body,
        })
        .returning();
      return row!;
    },

    /** 단건 조회(워크스페이스 격리). 없으면 undefined. */
    async getById(workspaceId: string, noteId: string) {
      const [row] = await db
        .select()
        .from(conversationNotes)
        .where(and(eq(conversationNotes.workspaceId, workspaceId), eq(conversationNotes.id, noteId)));
      return row;
    },

    /** 메모 본문 수정(updated_at 갱신). 대상 없으면 undefined. */
    async update(workspaceId: string, noteId: string, patch: UpdateNoteInput) {
      const [row] = await db
        .update(conversationNotes)
        .set({ body: patch.body, updatedAt: new Date() })
        .where(and(eq(conversationNotes.workspaceId, workspaceId), eq(conversationNotes.id, noteId)))
        .returning();
      return row;
    },

    /** 메모 삭제. 삭제 성공 여부 반환. */
    async remove(workspaceId: string, noteId: string) {
      const rows = await db
        .delete(conversationNotes)
        .where(and(eq(conversationNotes.workspaceId, workspaceId), eq(conversationNotes.id, noteId)))
        .returning({ id: conversationNotes.id });
      return rows.length > 0;
    },
  };
}

export type NoteRepo = ReturnType<typeof makeNoteRepo>;
