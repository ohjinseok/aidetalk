/**
 * 상담 메모 API — 대화 내부 메모(04_API_SPEC.md §2 예정 확장, 03 §3).
 * ⚠️ 메모는 상담원 전용이다. visitor 세션/토큰으로는 절대 조회할 수 없고,
 *    routes/widget.ts(위젯 표면)에는 이 리소스를 절대 노출하지 않는다(CLAUDE.md 규칙 9와 동일 취지).
 * 생성/작성자 = 인증 멤버(userId). 수정은 작성자만, 삭제는 작성자 또는 owner.
 *
 * ⚠️ serialize.ts는 병렬 작업(다른 에이전트) 중이라 여기서는 로컬로 직렬화한다.
 *
 * 라우트 등록 순서: "/conversations/:id/notes"(정적 세그먼트 "conversations")와
 * "/notes/:noteId"(정적 세그먼트 "notes")는 첫 세그먼트부터 갈라지므로 등록 순서와 무관하게
 * 서로 매칭이 겹치지 않는다. 그래도 관례상 대화 하위 경로를 먼저, 단건 경로를 뒤에 둔다.
 */
import {
  AppError,
  createNoteRequestSchema,
  updateNoteRequestSchema,
  type ConversationNote,
  type CreateNoteRequest,
  type UpdateNoteRequest,
} from "@aidetalk/shared";
import { Hono } from "hono";

import { validateJson, validated } from "../../http/middleware";
import type { HonoEnv } from "../../http/types";
import { getWsCtx } from "../../http/ws-ctx";

export function createNoteRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  // ---------- 대화 하위 메모 목록/생성 ----------

  // 목록 — authorName 포함(작성자 삭제 시 null). 대화가 타 워크스페이스 소유면 repo가 not_found.
  app.get("/:wsId/conversations/:id/notes", async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    const rows = await ctx.repos.note.listByConversation(wsId, c.req.param("id"));
    return c.json({ items: rows.map(serializeNote), nextCursor: null });
  });

  // 생성 — author = 인증 멤버. 대화가 타 워크스페이스 소유면 repo가 not_found.
  app.post(
    "/:wsId/conversations/:id/notes",
    validateJson(createNoteRequestSchema),
    async (c) => {
      const { ctx, wsId } = getWsCtx(c);
      const member = c.get("member")!;
      const body = validated<CreateNoteRequest>(c);

      const row = await ctx.repos.note.create(wsId, c.req.param("id"), {
        authorId: member.userId,
        body: body.body,
      });
      const author = await ctx.repos.user.getById(member.userId);
      return c.json({ note: serializeNote({ ...row, authorName: author?.name ?? null }) }, 201);
    },
  );

  // ---------- 단건 메모 수정/삭제 ----------

  // 수정 — 작성자 본인만.
  app.patch("/:wsId/notes/:noteId", validateJson(updateNoteRequestSchema), async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    const member = c.get("member")!;
    const noteId = c.req.param("noteId");
    const body = validated<UpdateNoteRequest>(c);

    const existing = await ctx.repos.note.getById(wsId, noteId);
    if (!existing) throw AppError.of("not_found", "note not found");
    if (existing.authorId !== member.userId) {
      throw AppError.of("auth/forbidden", "only the author can edit this note");
    }

    const row = await ctx.repos.note.update(wsId, noteId, { body: body.body });
    if (!row) throw AppError.of("not_found", "note not found");
    const author = await ctx.repos.user.getById(row.authorId);
    return c.json({ note: serializeNote({ ...row, authorName: author?.name ?? null }) });
  });

  // 삭제 — 작성자 또는 owner.
  app.delete("/:wsId/notes/:noteId", async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    const member = c.get("member")!;
    const noteId = c.req.param("noteId");

    const existing = await ctx.repos.note.getById(wsId, noteId);
    if (!existing) throw AppError.of("not_found", "note not found");
    if (existing.authorId !== member.userId && member.role !== "owner") {
      throw AppError.of("auth/forbidden", "only the author or owner can delete this note");
    }

    const removed = await ctx.repos.note.remove(wsId, noteId);
    if (!removed) throw AppError.of("not_found", "note not found");
    return c.body(null, 204);
  });

  return app;
}

/** conversation_notes row(+authorName) → ConversationNote(04 §6). */
function serializeNote(row: {
  id: string;
  conversationId: string;
  authorId: string;
  authorName?: string | null;
  body: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}): ConversationNote {
  return {
    id: row.id,
    conversationId: row.conversationId,
    authorId: row.authorId,
    authorName: row.authorName ?? null,
    body: row.body,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toIsoString(v: Date | string): string {
  return typeof v === "string" ? v : v.toISOString();
}
