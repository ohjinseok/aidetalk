/**
 * 인박스 API — 04_API_SPEC.md §2. 대화 목록/상세/메시지, 상담원 전송, 배정/반환/종료,
 * 상담 어시스트 제안(상담원 전용, 규칙 9).
 */
import {
  AppError,
  assignConversationRequestSchema,
  inboxSendMessageRequestSchema,
  patchSuggestionRequestSchema,
  type AssignConversationRequest,
  type InboxSendMessageRequest,
  type PatchSuggestionRequest,
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

  // 대화 목록(status/커서/q 검색).
  app.get("/:wsId/conversations", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const status = parseStatus(c.req.query("status"));
    const q = c.req.query("q")?.trim() || undefined;
    const cursor = decodeCursor(c.req.query("cursor"));
    const limit = clampLimit(c.req.query("limit"), 30, 100);

    const rows = await ctx.repos.conversation.listForInbox(wsId, { status, q, cursor, limit });
    const items = [];
    for (const conv of rows) {
      const lastRow = await ctx.repos.message.getLast(wsId, conv.id);
      const lastMessage = lastRow ? serializeMessage(lastRow) : null;
      const summary = await buildConversationSummary(ctx, wsId, conv, lastMessage);
      if (summary) items.push(summary);
    }
    const last = rows[rows.length - 1];
    const nextCursor =
      rows.length === limit && last
        ? encodeCursor({ createdAt: last.lastMessageAt ?? last.createdAt, id: last.id })
        : null;
    return c.json({ items, nextCursor });
  });

  // 대화 상세(+이벤트).
  app.get("/:wsId/conversations/:id", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const conv = await getConvOr404(c, wsId, c.req.param("id"));
    const visitor = await ctx.repos.visitor.getById(wsId, conv.visitorId);
    const events = await ctx.repos.event.listByConversation(wsId, conv.id);
    return c.json({
      conversation: serializeConversation(conv),
      visitor: visitor ? publicVisitor(visitor) : null,
      events: events.map(serializeEvent),
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

  // 종료 / 재오픈.
  app.post("/:wsId/conversations/:id/close", async (c) =>
    setStatusHandler(c, "closed", "closed"),
  );
  app.post("/:wsId/conversations/:id/reopen", async (c) =>
    setStatusHandler(c, "open", "reopened"),
  );

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

// ---------- 상태 변경 공통(close/reopen) ----------
async function setStatusHandler(
  c: Context<HonoEnv>,
  status: "open" | "closed",
  eventType: "closed" | "reopened",
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

/** 인박스 목록 실시간 갱신 브로드캐스트. */
async function broadcastInbox(
  c: Context<HonoEnv>,
  workspaceId: string,
  convRow: Parameters<typeof serializeConversation>[0],
) {
  const ctx = c.get("ctx");
  const lastRow = await ctx.repos.message.getLast(workspaceId, convRow.id);
  const lastMessage = lastRow ? serializeMessage(lastRow) : null;
  const summary = await buildConversationSummary(ctx, workspaceId, convRow, lastMessage);
  if (summary) await ctx.broadcaster.inboxUpsert(workspaceId, summary);
}

function parseStatus(raw: string | undefined): "open" | "pending" | "closed" | undefined {
  if (raw === "open" || raw === "pending" || raw === "closed") return raw;
  return undefined;
}
