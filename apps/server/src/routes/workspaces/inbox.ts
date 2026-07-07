/**
 * 인박스 API — 04_API_SPEC.md §2. 대화 목록/상세/메시지, 상담원 전송, 배정/반환/종료,
 * 상담 어시스트 제안(상담원 전용, 규칙 9).
 */
import {
  AppError,
  assignConversationRequestSchema,
  inboxSendMessageRequestSchema,
  patchSuggestionRequestSchema,
  setConversationTagRequestSchema,
  type AssignConversationRequest,
  type InboxSendMessageRequest,
  type PatchSuggestionRequest,
  type SetConversationTagRequest,
} from "@aidetalk/shared";
import { Hono, type Context } from "hono";

import { validateJson, validated } from "../../http/middleware";
import type { HonoEnv } from "../../http/types";
import { clampLimit, decodeCursor, encodeCursor } from "../../lib/cursor";
import {
  publicVisitor,
  serializeConversation,
  serializeEvent,
  serializeMessage,
  serializeSuggestion,
} from "../../lib/serialize";
import { buildConversationSummary } from "../../services/messaging";
import { appendServerMessage } from "../../services/outbound";
import { getConvOr404 } from "./shared";

export function createInboxRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  // 대화 목록 — status/커서/q + 담당자(assigneeId)/태그(tagId)/미열람(unread)/즐겨찾기(favorite) 필터.
  //   assigneeId=none  → 미배정만 / assigneeId=<userId> → 그 상담원 담당만
  //   tagId=<id>       → 그 태그 부착 대화만
  //   unread=1         → 미열람(방문자 발신 미확인)이 있는 대화만
  //   favorite=1       → 요청 상담원 본인이 즐겨찾기한 대화만
  app.get("/:wsId/conversations", async (c) => {
    const ctx = c.get("ctx");
    const member = c.get("member")!;
    const wsId = c.req.param("wsId");
    const status = parseStatus(c.req.query("status"));
    const q = c.req.query("q")?.trim() || undefined;
    const cursor = decodeCursor(c.req.query("cursor"));
    const limit = clampLimit(c.req.query("limit"), 30, 100);
    const assignee = parseAssignee(c.req.query("assigneeId"));
    const tagId = c.req.query("tagId")?.trim() || undefined;
    const unreadOnly = c.req.query("unread") === "1";
    const favoriteOf = c.req.query("favorite") === "1" ? member.userId : undefined;

    const rows = await ctx.repos.conversation.listForInbox(wsId, {
      status,
      q,
      cursor,
      limit,
      assignee,
      tagId,
      unreadOnly,
      favoriteOf,
    });

    // 태그/즐겨찾기는 목록 화면 배치 조회로 N+1을 피한다.
    const ids = rows.map((r) => r.id);
    const [tagMap, favSet] = await Promise.all([
      ctx.repos.tag.mapIdsByConversations(wsId, ids),
      ctx.repos.favorite.filterFavoriteIds(wsId, ids, member.userId),
    ]);

    const items = [];
    for (const conv of rows) {
      const lastRow = await ctx.repos.message.getLast(wsId, conv.id);
      const lastMessage = lastRow ? serializeMessage(lastRow) : null;
      const summary = await buildConversationSummary(ctx, wsId, conv, lastMessage, {
        unread: conv.unread,
        tagIds: tagMap.get(conv.id) ?? [],
      });
      if (summary) items.push({ ...summary, favorite: favSet.has(conv.id) });
    }
    const last = rows[rows.length - 1];
    const nextCursor =
      rows.length === limit && last
        ? encodeCursor({ createdAt: last.lastMessageAt ?? last.createdAt, id: last.id })
        : null;
    return c.json({ items, nextCursor });
  });

  // 인박스 카운트 배지(필터 탭/사이드바) — ⚠️ /:id 매칭보다 먼저 등록해야 한다(Hono 등록 순서).
  app.get("/:wsId/conversations/counts", async (c) => {
    const ctx = c.get("ctx");
    const member = c.get("member")!;
    const wsId = c.req.param("wsId");
    const counts = await ctx.repos.conversation.countsForInbox(wsId, member.userId);
    return c.json(counts);
  });

  // 대화 상세(+이벤트) — favorite/tagIds는 요청 상담원 기준 부가 정보(위젯 미노출).
  app.get("/:wsId/conversations/:id", async (c) => {
    const ctx = c.get("ctx");
    const member = c.get("member")!;
    const wsId = c.req.param("wsId");
    const conv = await getConvOr404(c, wsId, c.req.param("id"));
    const visitor = await ctx.repos.visitor.getById(wsId, conv.visitorId);
    const events = await ctx.repos.event.listByConversation(wsId, conv.id);
    const [favorite, tagIds] = await Promise.all([
      ctx.repos.favorite.isFavorite(wsId, conv.id, member.userId),
      ctx.repos.tag.listIdsByConversation(wsId, conv.id),
    ]);
    return c.json({
      conversation: serializeConversation(conv),
      visitor: visitor ? publicVisitor(visitor) : null,
      events: events.map(serializeEvent),
      favorite,
      tagIds,
    });
  });

  // 메시지 목록.
  app.get("/:wsId/conversations/:id/messages", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    await getConvOr404(c, wsId, c.req.param("id"));
    const after = decodeCursor(c.req.query("after"));
    const limit = clampLimit(c.req.query("limit"), 50, 100);
    const rows = await ctx.repos.message.listAfter(wsId, c.req.param("id"), after, limit);
    const items = rows.map(serializeMessage);
    const last = rows[rows.length - 1];
    const nextCursor = rows.length === limit && last ? encodeCursor(last) : null;
    return c.json({ items, nextCursor });
  });

  // 상담원 메시지 전송(agent_human) — mode=ai였으면 자동 human + 본인 배정 + 이벤트.
  app.post(
    "/:wsId/conversations/:id/messages",
    validateJson(inboxSendMessageRequestSchema),
    async (c) => {
      const ctx = c.get("ctx");
      const member = c.get("member")!;
      const wsId = c.req.param("wsId");
      const conv = await getConvOr404(c, wsId, c.req.param("id"));
      const body = validated<InboxSendMessageRequest>(c);

      // "사람이 끼어들면 AI는 물러난다" — mode=ai → human + assign(본인) + 이벤트.
      if (conv.mode === "ai") {
        await ctx.repos.conversation.setMode(wsId, conv.id, "human", member.userId);
        await ctx.repos.event.append(wsId, conv.id, {
          type: "assigned",
          actor: `user:${member.userId}`,
          payload: { userId: member.userId, reason: "agent_reply" },
        });
      }

      const { message, conversation } = await appendServerMessage(ctx, {
        workspaceId: wsId,
        conversationId: conv.id,
        role: "agent_human",
        authorId: member.userId,
        content: { type: "text", text: body.text },
      });
      if (conv.mode === "ai" && conversation) {
        await ctx.broadcaster.conversationUpdated(conversation);
      }
      return c.json({ message }, 201);
    },
  );

  // 담당자 지정/해제.
  app.post(
    "/:wsId/conversations/:id/assign",
    validateJson(assignConversationRequestSchema),
    async (c) => {
      const ctx = c.get("ctx");
      const member = c.get("member")!;
      const wsId = c.req.param("wsId");
      const conv = await getConvOr404(c, wsId, c.req.param("id"));
      const body = validated<AssignConversationRequest>(c);

      const updated = await ctx.repos.conversation.assign(wsId, conv.id, body.userId);
      await ctx.repos.event.append(wsId, conv.id, {
        type: body.userId ? "assigned" : "unassigned",
        actor: `user:${member.userId}`,
        payload: body.userId ? { userId: body.userId } : {},
      });
      const conversation = serializeConversation(updated ?? conv);
      await ctx.broadcaster.conversationUpdated(conversation);
      await broadcastInbox(c, wsId, updated ?? conv);
      return c.json({ conversation });
    },
  );

  // AI에게 반환.
  app.post("/:wsId/conversations/:id/return-to-ai", async (c) => {
    const ctx = c.get("ctx");
    const member = c.get("member")!;
    const wsId = c.req.param("wsId");
    const conv = await getConvOr404(c, wsId, c.req.param("id"));

    const updated = await ctx.repos.conversation.setMode(wsId, conv.id, "ai", null);
    await ctx.repos.event.append(wsId, conv.id, {
      type: "returned_to_ai",
      actor: `user:${member.userId}`,
      payload: {},
    });
    const conversation = serializeConversation(updated ?? conv);
    await ctx.broadcaster.conversationUpdated(conversation);
    await broadcastInbox(c, wsId, updated ?? conv);
    return c.json({ conversation });
  });

  // 종료 / 재오픈 / 보류(pending).
  app.post("/:wsId/conversations/:id/close", async (c) =>
    setStatusHandler(c, "closed", "closed"),
  );
  app.post("/:wsId/conversations/:id/reopen", async (c) =>
    setStatusHandler(c, "open", "reopened"),
  );
  app.post("/:wsId/conversations/:id/hold", async (c) =>
    setStatusHandler(c, "pending", "pending"),
  );

  // ---------- 즐겨찾기(상담원 개인별 — ⚠️ WS 브로드캐스트 안 함) ----------
  app.put("/:wsId/conversations/:id/favorite", async (c) => {
    const ctx = c.get("ctx");
    const member = c.get("member")!;
    const wsId = c.req.param("wsId");
    const ok = await ctx.repos.favorite.set(wsId, c.req.param("id"), member.userId);
    if (!ok) throw AppError.of("not_found", "대화를 찾을 수 없다.");
    return c.json({ favorite: true });
  });
  app.delete("/:wsId/conversations/:id/favorite", async (c) => {
    const ctx = c.get("ctx");
    const member = c.get("member")!;
    const wsId = c.req.param("wsId");
    await ctx.repos.favorite.unset(wsId, c.req.param("id"), member.userId);
    return c.json({ favorite: false });
  });

  // ---------- 대화 태그 부착/제거(성공 후 inbox.upsert로 목록의 tagIds 갱신 전파) ----------
  app.post(
    "/:wsId/conversations/:id/tags",
    validateJson(setConversationTagRequestSchema),
    async (c) => {
      const wsId = c.req.param("wsId");
      const conv = await getConvOr404(c, wsId, c.req.param("id"));
      const body = validated<SetConversationTagRequest>(c);
      const ctx = c.get("ctx");
      // 대화는 위에서 확인됐으므로 undefined는 태그가 없거나 교차 워크스페이스 태그를 뜻한다.
      const tagIds = await ctx.repos.tag.addToConversation(wsId, conv.id, body.tagId);
      if (tagIds === undefined) throw AppError.of("not_found", "태그를 찾을 수 없다.");
      await broadcastInbox(c, wsId, conv, { tagIds });
      return c.json({ tagIds });
    },
  );
  app.delete("/:wsId/conversations/:id/tags/:tagId", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const conv = await getConvOr404(c, wsId, c.req.param("id"));
    const tagIds = await ctx.repos.tag.removeFromConversation(wsId, conv.id, c.req.param("tagId"));
    await broadcastInbox(c, wsId, conv, { tagIds });
    return c.json({ tagIds });
  });

  // ---------- 상담 어시스트(상담원 전용) ----------

  // 제안 목록 — memberContext 필수(visitor 접근 원천 차단).
  app.get("/:wsId/conversations/:id/suggestions", async (c) => {
    const ctx = c.get("ctx");
    const member = c.get("member")!;
    const wsId = c.req.param("wsId");
    await getConvOr404(c, wsId, c.req.param("id"));
    const rows = await ctx.repos.assist.listByConversation(wsId, c.req.param("id"), member);
    return c.json({ items: rows.map(serializeSuggestion) });
  });

  // 제안 결과 기록.
  app.patch("/:wsId/suggestions/:id", validateJson(patchSuggestionRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const member = c.get("member")!;
    const wsId = c.req.param("wsId");
    const body = validated<PatchSuggestionRequest>(c);
    const row = await ctx.repos.assist.setOutcome(wsId, c.req.param("id"), body.outcome, member);
    if (!row) throw AppError.of("not_found", "제안을 찾을 수 없다.");
    return c.json({ suggestion: serializeSuggestion(row) });
  });

  return app;
}

// ---------- 상태 변경 공통(close/reopen/hold) ----------
async function setStatusHandler(
  c: Context<HonoEnv>,
  status: "open" | "pending" | "closed",
  eventType: "closed" | "reopened" | "pending",
) {
  const ctx = c.get("ctx");
  const member = c.get("member")!;
  const wsId = c.req.param("wsId")!;
  const conv = await getConvOr404(c, wsId, c.req.param("id")!);
  const updated = await ctx.repos.conversation.setStatus(wsId, conv.id, status);
  await ctx.repos.event.append(wsId, conv.id, {
    type: eventType,
    actor: `user:${member.userId}`,
    payload: {},
  });
  const conversation = serializeConversation(updated ?? conv);
  await ctx.broadcaster.conversationUpdated(conversation);
  await broadcastInbox(c, wsId, updated ?? conv);
  return c.json({ conversation });
}

/**
 * 인박스 목록 실시간 갱신 브로드캐스트 — summary에 unread/tagIds를 실어 상담원 목록이
 * 미열람 배지/태그를 즉시 반영하게 한다. tagIds가 이미 있으면(태그 변경 핸들러) 재조회하지 않는다.
 */
async function broadcastInbox(
  c: Context<HonoEnv>,
  workspaceId: string,
  convRow: Parameters<typeof serializeConversation>[0],
  extras?: { tagIds?: string[] },
) {
  const ctx = c.get("ctx");
  const lastRow = await ctx.repos.message.getLast(workspaceId, convRow.id);
  const lastMessage = lastRow ? serializeMessage(lastRow) : null;
  const [unread, tagIds] = await Promise.all([
    ctx.repos.conversation.unreadCount(workspaceId, convRow.id),
    extras?.tagIds ?? ctx.repos.tag.listIdsByConversation(workspaceId, convRow.id),
  ]);
  const summary = await buildConversationSummary(ctx, workspaceId, convRow, lastMessage, {
    unread,
    tagIds,
  });
  if (summary) await ctx.broadcaster.inboxUpsert(workspaceId, summary);
}

/** assigneeId 쿼리 파싱 — "none"=미배정, 그 외 비어있지 않으면 특정 상담원. */
function parseAssignee(
  raw: string | undefined,
): { kind: "user"; userId: string } | { kind: "none" } | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim();
  if (v === "") return undefined;
  if (v === "none") return { kind: "none" };
  return { kind: "user", userId: v };
}

function parseStatus(raw: string | undefined): "open" | "pending" | "closed" | undefined {
  if (raw === "open" || raw === "pending" || raw === "closed") return raw;
  return undefined;
}
