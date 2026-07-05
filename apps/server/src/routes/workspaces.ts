/**
 * 워크스페이스 API — 04_API_SPEC.md §2. 세션 쿠키 인증 + membership 검증.
 * Agent 커넥터 CRUD/test/logs, 인박스(대화·메시지·이벤트·제안), 멤버, 설정.
 * DB 접근은 전부 repos 경유(라우트 직접 쿼리 금지). 에러 코드는 04 §7만.
 */
import { randomBytes } from "node:crypto";

import { encryptSecret, hashSecret } from "@aidetalk/db";
import { AppError } from "@aidetalk/shared";
import { Hono, type Context } from "hono";

import {
  requireMembership,
  requireUser,
  validateJson,
  validated,
} from "../http/middleware";
import {
  assignConversationRequestSchema,
  createAgentRequestSchema,
  createWorkspaceRequestSchema,
  inboxSendMessageRequestSchema,
  inviteMemberRequestSchema,
  patchSuggestionRequestSchema,
  updateAgentRequestSchema,
  updateWorkspaceSettingsRequestSchema,
  type AssignConversationRequest,
  type CreateAgentRequest,
  type CreateWorkspaceRequest,
  type InboxSendMessageRequest,
  type InviteMemberRequest,
  type PatchSuggestionRequest,
  type UpdateAgentRequest,
  type UpdateWorkspaceSettingsRequest,
} from "../http/schemas";
import type { HonoEnv, MemberAuth } from "../http/types";
import { testAgentConnection } from "../dispatch/test";
import { generateAgentSecret } from "../lib/agent-secret";
import { validateAgentEndpoint } from "../lib/agent-endpoint";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import {
  serializeAgent,
  serializeAgentLog,
  serializeConversation,
  serializeConversionEvent,
  serializeEvent,
  serializeMessage,
  serializeSuggestion,
  serializeTrackedLink,
} from "../lib/serialize";
import { buildConversationSummary } from "../services/messaging";
import { appendServerMessage } from "../services/outbound";
import { buildTrackingSummary, parseTrackingRange } from "../services/tracking";

export function createWorkspaceRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  // 전 경로 로그인 필수.
  app.use("/*", requireUser);
  // 워크스페이스 하위 리소스는 전부 membership 검증(§2).
  app.use("/:wsId/*", requireMembership);

  // ---------- 워크스페이스 생성(생성자=owner) ----------
  app.post("/", validateJson(createWorkspaceRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const { userId } = c.get("user")!;
    const body = validated<CreateWorkspaceRequest>(c);

    const workspace = await ctx.repos.workspace.create({
      name: body.name,
      segment: body.segment,
    });
    await ctx.repos.member.addActive(workspace.id, userId, "owner");
    return c.json({ workspace: serializeWorkspace(workspace) }, 201);
  });

  // ---------- 단건 조회 ----------
  app.get("/:wsId", requireMembership, async (c) => {
    const ctx = c.get("ctx");
    const workspace = await ctx.repos.workspace.getById(c.req.param("wsId"));
    if (!workspace) throw AppError.of("not_found", "워크스페이스를 찾을 수 없다.");
    return c.json({ workspace: serializeWorkspace(workspace) });
  });

  // ---------- 워크스페이스 설정(owner만) ----------
  app.patch("/:wsId/settings", validateJson(updateWorkspaceSettingsRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    assertOwner(c.get("member")!);
    const wsId = c.req.param("wsId");
    const body = validated<UpdateWorkspaceSettingsRequest>(c);

    const workspace = await ctx.repos.workspace.getById(wsId);
    if (!workspace) throw AppError.of("not_found", "워크스페이스를 찾을 수 없다.");

    const updated = await ctx.repos.workspace.updateSettingsFields(wsId, {
      name: body.name,
      widgetSettings: body.widgetSettings,
      attributionRule: body.attributionRule,
    });
    return c.json({ workspace: serializeWorkspace(updated ?? workspace) });
  });

  // ================= Agent 커넥터 =================

  // 등록 — secret 원문은 이 응답 1회만.
  app.post("/:wsId/agents", validateJson(createAgentRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const body = validated<CreateAgentRequest>(c);

    const endpointUrl = await validateAgentEndpoint(body.endpointUrl, endpointPolicy(ctx.env));
    const secret = generateAgentSecret();
    const secretEnc = encryptSecret(secret, ctx.env.SESSION_SECRET);

    const agent = await ctx.repos.agent.create(wsId, {
      name: body.name,
      endpointUrl,
      secret,
      secretEnc,
      timeoutMs: body.timeoutMs,
    });
    // ⚠️ secret 원문은 응답 1회만. 이후 조회 불가.
    return c.json({ agent: serializeAgent(agent), secret }, 201);
  });

  // 목록.
  app.get("/:wsId/agents", async (c) => {
    const ctx = c.get("ctx");
    const rows = await ctx.repos.agent.list(c.req.param("wsId"));
    return c.json({ items: rows.map(serializeAgent) });
  });

  // 수정 — active 전환 시 기존 active 자동 disabled(1개 제약).
  app.patch("/:wsId/agents/:id", validateJson(updateAgentRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const agentId = c.req.param("id");
    const body = validated<UpdateAgentRequest>(c);

    const existing = await ctx.repos.agent.getById(wsId, agentId);
    if (!existing) throw AppError.of("not_found", "커넥터를 찾을 수 없다.");

    // 필드 갱신(endpointUrl 변경 시 재검증).
    const patch: { name?: string; endpointUrl?: string; timeoutMs?: number; assistEnabled?: boolean } =
      {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.timeoutMs !== undefined) patch.timeoutMs = body.timeoutMs;
    if (body.assistEnabled !== undefined) patch.assistEnabled = body.assistEnabled;
    if (body.endpointUrl !== undefined) {
      patch.endpointUrl = await validateAgentEndpoint(body.endpointUrl, endpointPolicy(ctx.env));
    }
    if (Object.keys(patch).length > 0) {
      await ctx.repos.agent.update(wsId, agentId, patch);
    }

    // status 전환.
    if (body.status !== undefined) {
      if (body.status === "active") {
        // 기존 active(자기 자신 제외)를 먼저 disabled 처리(자동 1개 제약).
        const current = await ctx.repos.agent.getActive(wsId);
        if (current && current.id !== agentId) {
          await ctx.repos.agent.setStatus(wsId, current.id, "disabled");
        }
        await ctx.repos.agent.setStatus(wsId, agentId, "active");
      } else {
        await ctx.repos.agent.setStatus(wsId, agentId, "disabled");
      }
    }

    const updated = await ctx.repos.agent.getById(wsId, agentId);
    return c.json({ agent: serializeAgent(updated!) });
  });

  // secret 재발급 — 새 secret 1회 노출.
  app.post("/:wsId/agents/:id/rotate-secret", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const agentId = c.req.param("id");
    const existing = await ctx.repos.agent.getById(wsId, agentId);
    if (!existing) throw AppError.of("not_found", "커넥터를 찾을 수 없다.");

    const secret = generateAgentSecret();
    const secretEnc = encryptSecret(secret, ctx.env.SESSION_SECRET);
    await ctx.repos.agent.rotateSecret(wsId, agentId, secret, secretEnc);
    return c.json({ secret });
  });

  // 연결 테스트 — 실제 dispatch.
  app.post("/:wsId/agents/:id/test", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const agentId = c.req.param("id");
    const agent = await ctx.repos.agent.getById(wsId, agentId);
    if (!agent) throw AppError.of("not_found", "커넥터를 찾을 수 없다.");

    const result = await testAgentConnection(ctx, wsId, {
      id: agent.id,
      endpointUrl: agent.endpointUrl,
      secretEnc: agent.secretEnc,
      timeoutMs: agent.timeoutMs,
    });
    return c.json(result);
  });

  // AI 로그 목록.
  app.get("/:wsId/agent-logs", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const agentId = c.req.query("agentId");
    if (!agentId) throw AppError.of("validation/failed", "agentId 쿼리가 필요하다.");

    const cursor = decodeCursor(c.req.query("cursor"));
    const limit = clampLimit(c.req.query("limit"), 50, 100);
    const rows = await ctx.repos.agentLog.listByAgent(wsId, agentId, cursor, limit);
    const items = rows.map(serializeAgentLog);
    const last = rows[rows.length - 1];
    const nextCursor = rows.length === limit && last ? encodeCursor(last) : null;
    return c.json({ items, nextCursor });
  });

  // ================= 인박스 =================

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

  // ================= 상담 어시스트(상담원 전용) =================

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

  // ================= 전환 트래킹(S1 전용, CLAUDE.md 규칙 10) =================
  // segment=s2_no_site 워크스페이스에는 이 두 엔드포인트가 존재하지 않는 것처럼 404.

  // 대화 상세 트래킹(링크·클릭·전환) — 04 §2.
  app.get("/:wsId/conversations/:id/tracking", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    await assertS1Segment(c);
    const conv = await getConvOr404(c, wsId, c.req.param("id"));
    const links = await ctx.repos.trackedLink.listByConversation(wsId, conv.id);
    const conversions = await ctx.repos.conversion.listByConversation(wsId, conv.id);
    return c.json({
      trackedLinks: links.map(serializeTrackedLink),
      conversions: conversions.map(serializeConversionEvent),
    });
  });

  // 워크스페이스 트래킹 요약(기간) — 04 §2. ⚠️ attributedRevenueKrw는 "상담 기여 매출(추정)".
  app.get("/:wsId/tracking/summary", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    await assertS1Segment(c);
    const { from, to } = parseTrackingRange(c.req.query("from"), c.req.query("to"));
    const summary = await buildTrackingSummary(ctx, wsId, from, to);
    return c.json(summary);
  });

  // ================= 멤버 =================

  // 초대(owner만) — planEnforcer.assertCanAddSeat.
  // 기가입 이메일이면 기존 멤버 초대(members.invite → 수락 후 합류) 흐름 유지.
  // 미가입 이메일이면 invites 행 생성(가입/로그인 후 수락). 두 경우 모두 inviteUrl은
  // 대시보드 /invites/accept?token= 로 통일한다.
  app.post("/:wsId/members", validateJson(inviteMemberRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const owner = c.get("member")!;
    assertOwner(owner);
    const wsId = c.req.param("wsId");
    const body = validated<InviteMemberRequest>(c);

    // 시트 한도 검사는 초대(행 생성) 시점에.
    await ctx.planEnforcer.assertCanAddSeat(wsId);

    const acceptUrl = (token: string) =>
      `${ctx.env.DASHBOARD_URL}/invites/accept?token=${encodeURIComponent(token)}`;

    const user = await ctx.repos.user.getByEmail(body.email);
    if (user) {
      // 기가입 계정 — 기존 members 초대 흐름 유지.
      if (await ctx.repos.member.getRole(wsId, user.id)) {
        throw AppError.of("conflict", "이미 워크스페이스 멤버다.");
      }
      const member = await ctx.repos.member.invite(wsId, { userId: user.id, role: body.role });
      return c.json(
        { member: serializeMember(member), inviteUrl: acceptUrl(member.inviteToken!) },
        201,
      );
    }

    // 미가입 이메일 — invites 행 생성. raw token은 응답 URL에만 노출, DB엔 sha256만 저장.
    const rawToken = randomBytes(24).toString("base64url");
    const invite = await ctx.repos.invite.create(wsId, {
      email: body.email,
      role: body.role,
      tokenHash: hashSecret(rawToken),
      invitedBy: owner.userId,
    });
    return c.json({ member: null, invite: serializeInvite(invite), inviteUrl: acceptUrl(rawToken) }, 201);
  });

  // 목록.
  app.get("/:wsId/members", async (c) => {
    const ctx = c.get("ctx");
    const rows = await ctx.repos.member.list(c.req.param("wsId"));
    return c.json({ items: rows.map(serializeMember) });
  });

  // 삭제(owner만).
  app.delete("/:wsId/members/:id", async (c) => {
    const ctx = c.get("ctx");
    assertOwner(c.get("member")!);
    await ctx.repos.member.remove(c.req.param("wsId"), c.req.param("id"));
    return c.body(null, 204);
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

// ---------- 헬퍼 ----------

/** 대화 로드 + 워크스페이스 격리(없으면 404). */
async function getConvOr404(
  c: Context<HonoEnv>,
  workspaceId: string,
  conversationId: string,
) {
  const ctx = c.get("ctx");
  const conv = await ctx.repos.conversation.getById(workspaceId, conversationId);
  if (!conv) throw AppError.of("not_found", "대화를 찾을 수 없다.");
  return conv;
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

function assertOwner(member: MemberAuth): void {
  if (member.role !== "owner") {
    throw AppError.of("auth/forbidden", "소유자만 수행할 수 있다.");
  }
}

/**
 * 전환 트래킹 API는 S1(segment=s1_site) 전용 — S2는 마치 라우트가 없는 것처럼 404.
 * (CLAUDE.md 규칙 10 / 04 §2 "segment=s2_no_site면 전부 404")
 */
async function assertS1Segment(c: Context<HonoEnv>): Promise<void> {
  const ctx = c.get("ctx");
  const wsId = c.req.param("wsId")!;
  const workspace = await ctx.repos.workspace.getById(wsId);
  if (!workspace || workspace.segment === "s2_no_site") {
    throw AppError.of("not_found", "이 워크스페이스에는 트래킹 API가 없다.");
  }
}

function endpointPolicy(env: HonoEnv["Variables"]["ctx"]["env"]) {
  return {
    cloud: env.EDITION === "cloud",
    allowInsecure: env.ALLOW_INSECURE_AGENT_ENDPOINT,
  };
}

function parseStatus(raw: string | undefined): "open" | "pending" | "closed" | undefined {
  if (raw === "open" || raw === "pending" || raw === "closed") return raw;
  return undefined;
}

function clampLimit(raw: string | undefined, fallback: number, max: number): number {
  const n = raw ? Number(raw) : fallback;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function publicVisitor(v: {
  id: string;
  email: string | null;
  name: string | null;
  attributes: Record<string, unknown>;
  firstPageUrl: string | null;
  firstReferrer: string | null;
}) {
  return {
    id: v.id,
    email: v.email,
    name: v.name,
    attributes: v.attributes,
    firstPageUrl: v.firstPageUrl,
    firstReferrer: v.firstReferrer,
  };
}

function serializeMember(row: {
  id: string;
  userId: string;
  role: string;
  status: string;
  email?: string;
  name?: string;
  createdAt?: Date | string;
}) {
  return {
    id: row.id,
    userId: row.userId,
    role: row.role,
    status: row.status,
    email: row.email ?? null,
    name: row.name ?? null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : (row.createdAt ?? null),
  };
}

/** invites row → 공개 초대 객체(token_hash는 절대 노출 금지, 규칙 5). */
function serializeInvite(row: {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  expiresAt: Date | string;
  acceptedAt: Date | string | null;
  createdAt: Date | string;
}) {
  const iso = (v: Date | string | null) =>
    v == null ? null : v instanceof Date ? v.toISOString() : v;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role,
    status: "invited" as const,
    expiresAt: iso(row.expiresAt),
    acceptedAt: iso(row.acceptedAt),
    createdAt: iso(row.createdAt),
  };
}

function serializeWorkspace(row: {
  id: string;
  name: string;
  segment: string;
  plan: string;
  widgetSettings: Record<string, unknown>;
  attributionRule: string;
  createdAt: Date | string;
}) {
  return {
    id: row.id,
    name: row.name,
    segment: row.segment,
    plan: row.plan,
    widgetSettings: row.widgetSettings,
    attributionRule: row.attributionRule,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}
