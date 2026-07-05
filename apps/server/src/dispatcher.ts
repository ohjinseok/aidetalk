/**
 * Agent Dispatcher — 02_ARCHITECTURE.md §3.1/§3.5, 05_AGENT_PROTOCOL.md.
 * mode=ai 대화의 손님 메시지 → reply dispatch, mode=human → assist dispatch.
 *
 * ⚠️ CLAUDE.md 규칙 1: 코어는 LLM을 호출하지 않는다. 유저 endpoint로 릴레이만 한다.
 * ⚠️ 규칙 5: secret은 서명 직전에만 복호화하고 로그/응답에 남기지 않는다(마스킹).
 * ⚠️ 규칙 9: assist 결과(suggest)는 agents 채널로만 push, 손님에게 전송 금지.
 */
import { decryptSecret } from "@aidetalk/db";
import { t } from "@aidetalk/i18n";
import {
  parseAgentResponse,
  type AgentReplyResponse,
  type AgentRequest,
  type Conversation,
  type Message,
} from "@aidetalk/shared";

import type { AppContext } from "./context";
import { buildAgentRequest, HISTORY_LIMIT } from "./dispatch/build-request";
import { postToAgent, type DispatchOutcome } from "./dispatch/http";
import { assertResolvesToPublicIp } from "./lib/agent-endpoint";
import { resolveSecretEncKeyMaterial } from "./lib/secret-enc-key";
import { serializeSuggestion } from "./lib/serialize";
import {
  extractUrls,
  generateLinkToken,
  replaceUrls,
  type LinkReplacement,
} from "./lib/track-links";
import { performHandoff } from "./services/handoff";
import { appendServerMessage } from "./services/outbound";

export interface VisitorMessageContext {
  workspaceId: string;
  conversation: Conversation;
  message: Message;
}

export interface AgentDispatcher {
  /** mode=ai/human 대화에 손님 메시지가 저장·브로드캐스트된 직후 호출. */
  onVisitorMessage(ctx: VisitorMessageContext): Promise<void>;
  /** 테스트용 — 진행 중 dispatch 완료 대기(선택 구현). */
  whenIdle?(): Promise<void>;
}

/** reply 연속 실패 auto_disable 임계 — 05/08 문서. */
const AUTO_DISABLE_THRESHOLD = 5;

/** 워크스페이스별 dispatch 동시성 상한 — 08_SECURITY.md §5(에이전트 서버 보호 + 우리 자원 보호). */
export const DISPATCH_CONCURRENCY_PER_WORKSPACE = 10;

/**
 * 워크스페이스 키별 동시성 세마포어. 각 키에 대해 limit개까지 동시 실행,
 * 초과 요청은 FIFO로 대기하다 슬롯이 나면 진행한다(슬롯 수는 유지되며 대기자에게 이양).
 */
export class KeyedSemaphore {
  private active = new Map<string, number>();
  private waiters = new Map<string, Array<() => void>>();

  constructor(private readonly limit: number) {}

  async acquire(key: string): Promise<void> {
    const n = this.active.get(key) ?? 0;
    if (n < this.limit) {
      this.active.set(key, n + 1);
      return;
    }
    await new Promise<void>((resolve) => {
      const q = this.waiters.get(key) ?? [];
      q.push(resolve);
      this.waiters.set(key, q);
    });
  }

  release(key: string): void {
    const q = this.waiters.get(key);
    if (q && q.length > 0) {
      const next = q.shift()!;
      if (q.length === 0) this.waiters.delete(key);
      next(); // 슬롯을 대기자에게 이양(active 카운트 유지).
      return;
    }
    const n = (this.active.get(key) ?? 1) - 1;
    if (n <= 0) this.active.delete(key);
    else this.active.set(key, n);
  }

  /** 테스트용 — 특정 키의 현재 활성 슬롯 수. */
  activeCount(key: string): number {
    return this.active.get(key) ?? 0;
  }
}

/** 셀프호스팅/테스트 기본 구현 — 아무 동작도 하지 않는다. */
export class NoopAgentDispatcher implements AgentDispatcher {
  async onVisitorMessage(_ctx: VisitorMessageContext): Promise<void> {
    // 릴레이 없음.
  }
}

/** 실제 HTTP 릴레이 구현. */
export class HttpAgentDispatcher implements AgentDispatcher {
  private inflight = new Set<Promise<void>>();
  /** 워크스페이스별 dispatch 동시성 상한(08 §5). */
  private readonly semaphore = new KeyedSemaphore(DISPATCH_CONCURRENCY_PER_WORKSPACE);

  constructor(private readonly app: AppContext) {}

  async onVisitorMessage(vmCtx: VisitorMessageContext): Promise<void> {
    const p = this.runGuarded(vmCtx).catch((err) => {
      this.app.logger.error({ err: (err as Error).message }, "agent dispatch 실패");
    });
    this.inflight.add(p);
    void p.finally(() => this.inflight.delete(p));
    await p;
  }

  /** 워크스페이스 동시성 슬롯을 확보한 뒤 run을 실행한다(초과분은 대기). */
  private async runGuarded(vmCtx: VisitorMessageContext): Promise<void> {
    await this.semaphore.acquire(vmCtx.workspaceId);
    try {
      await this.run(vmCtx);
    } finally {
      this.semaphore.release(vmCtx.workspaceId);
    }
  }

  /** 진행 중 모든 dispatch 완료 대기(테스트 결정성). */
  async whenIdle(): Promise<void> {
    await Promise.all([...this.inflight]);
  }

  private async run(vmCtx: VisitorMessageContext): Promise<void> {
    const { workspaceId, conversation, message } = vmCtx;
    const agent = await this.app.repos.agent.getActive(workspaceId);
    if (!agent) return; // active 커넥터 없음 → 무동작(auto_disabled 포함).

    const mode = conversation.mode === "ai" ? "reply" : "assist";
    if (mode === "assist" && !agent.assistEnabled) return; // 어시스트 비활성.

    // ---------- 요청 조립 ----------
    const request = await this.buildRequest(mode, workspaceId, conversation, message);

    // secret 복호화(서명용). 없으면(구성 오류) reply는 실패 처리, assist는 조용히 스킵.
    let secret: string;
    try {
      if (!agent.secretEnc) throw new Error("secretEnc 없음");
      secret = decryptSecret(agent.secretEnc, resolveSecretEncKeyMaterial(this.app.env));
    } catch {
      this.app.logger.error({ agentId: agent.id }, "커넥터 secret 복호화 실패(서명 불가)");
      if (mode === "reply") {
        await this.handleReplyFailure(agent, vmCtx, request, {
          kind: "network_error",
          message: "secret unavailable",
          latencyMs: 0,
        });
      }
      return;
    }

    // dispatch 직전 SSRF 재검사(클라우드, DNS 리바인딩 대비).
    if (this.app.env.EDITION === "cloud" && !this.app.env.ALLOW_INSECURE_AGENT_ENDPOINT) {
      try {
        await assertResolvesToPublicIp(new URL(agent.endpointUrl).hostname);
      } catch {
        if (mode === "reply") {
          await this.handleReplyFailure(agent, vmCtx, request, {
            kind: "network_error",
            message: "ssrf blocked",
            latencyMs: 0,
          });
        }
        return;
      }
    }

    // ---------- dispatch ----------
    // reply 모드에서만 손님에게 typing 표시(assist는 손님에게 보이지 않아야 함).
    if (mode === "reply") await this.app.broadcaster.typing(conversation.id, "ai", true);

    let outcome: DispatchOutcome;
    try {
      outcome = await postToAgent({
        endpointUrl: agent.endpointUrl,
        secret,
        rawBody: JSON.stringify(request),
        timeoutMs: agent.timeoutMs,
      });
    } finally {
      if (mode === "reply") await this.app.broadcaster.typing(conversation.id, "ai", false);
    }

    if (mode === "reply") {
      await this.handleReplyOutcome(agent, vmCtx, request, outcome);
    } else {
      await this.handleAssistOutcome(agent, vmCtx, request, outcome);
    }
  }

  // ---------- 요청 조립 ----------
  private async buildRequest(
    mode: "reply" | "assist",
    workspaceId: string,
    conversation: Conversation,
    message: Message,
  ): Promise<AgentRequest> {
    const [visitor, workspace, recentRows] = await Promise.all([
      this.app.repos.visitor.getById(workspaceId, conversation.visitorId),
      this.app.repos.workspace.getById(workspaceId),
      this.app.repos.message.listRecent(workspaceId, conversation.id, HISTORY_LIMIT + 1),
    ]);
    const recentMessages: Message[] = recentRows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      role: r.role as Message["role"],
      authorId: r.authorId,
      content: r.content,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
    // agentMetadata는 widgetSettings 정규 스키마 밖의 선택 필드라 캐스팅으로 읽는다(있으면 그대로 전달).
    const wsMeta =
      ((workspace?.widgetSettings as Record<string, unknown> | undefined)?.agentMetadata as
        | Record<string, unknown>
        | undefined) ?? {};
    return buildAgentRequest({
      mode,
      conversation,
      message,
      recentMessages,
      visitor: {
        id: conversation.visitorId,
        email: visitor?.email ?? null,
        name: visitor?.name ?? null,
        attributes: visitor?.attributes ?? {},
        firstPageUrl: visitor?.firstPageUrl ?? null,
      },
      workspaceId,
      workspaceMetadata: wsMeta,
    });
  }

  // ---------- reply 결과 처리 ----------
  private async handleReplyOutcome(
    agent: { id: string; name: string; endpointUrl: string },
    vmCtx: VisitorMessageContext,
    request: AgentRequest,
    outcome: DispatchOutcome,
  ): Promise<void> {
    if (outcome.kind !== "ok") {
      await this.handleReplyFailure(agent, vmCtx, request, outcome);
      return;
    }

    // 빈 body → 실패.
    if (!outcome.body.trim()) {
      await this.handleReplyFailure(agent, vmCtx, request, outcome);
      return;
    }

    let parsed;
    try {
      parsed = parseAgentResponse("reply", JSON.parse(outcome.body));
    } catch {
      await this.handleReplyFailure(agent, vmCtx, request, outcome);
      return;
    }

    if (parsed.type === "reply") {
      const savedText = await this.deliverReply(vmCtx, parsed);
      await this.app.repos.agent.resetFailure(vmCtx.workspaceId, agent.id);
      await this.log(agent.id, vmCtx, request, "reply", {
        type: "reply",
        textPreview: savedText.slice(0, 500),
        latencyMs: outcome.latencyMs,
        httpStatus: outcome.status,
      });
    } else if (parsed.type === "handoff") {
      await performHandoff(this.app, {
        workspaceId: vmCtx.workspaceId,
        conversation: vmCtx.conversation,
        eventType: "handoff_agent",
        reason: parsed.reason,
        summary: parsed.summary ?? null,
        messageToVisitor: parsed.message_to_visitor ?? t("server.handoffDefaultMessage"),
        actor: `agent:${agent.id}`,
      });
      await this.app.repos.agent.resetFailure(vmCtx.workspaceId, agent.id);
      await this.log(agent.id, vmCtx, request, "handoff", {
        type: "handoff",
        textPreview: (parsed.reason ?? "").slice(0, 500),
        latencyMs: outcome.latencyMs,
        httpStatus: outcome.status,
      });
    } else {
      // noop
      await this.app.repos.agent.resetFailure(vmCtx.workspaceId, agent.id);
      await this.log(agent.id, vmCtx, request, "noop", {
        type: "noop",
        latencyMs: outcome.latencyMs,
        httpStatus: outcome.status,
      });
    }
  }

  /** reply 저장 + track_links 치환 + quick_replies/typing_delay 반영. 반환: 최종 발송 text. */
  private async deliverReply(
    vmCtx: VisitorMessageContext,
    reply: AgentReplyResponse,
  ): Promise<string> {
    const { workspaceId, conversation } = vmCtx;

    // track_links 치환.
    let text = reply.text;
    let linkPlan: { targetUrl: string; token: string }[] = [];
    if (reply.track_links) {
      const urls = extractUrls(reply.text);
      if (urls.length > 0) {
        const replacements: LinkReplacement[] = urls.map((u) => ({
          original: u,
          token: generateLinkToken(),
        }));
        text = replaceUrls(reply.text, replacements);
        linkPlan = replacements.map((r) => ({ targetUrl: r.original, token: r.token }));
      }
    }

    // typing_delay_ms(발송 전 추가 타이핑 표시 시간).
    if (reply.typing_delay_ms && reply.typing_delay_ms > 0) {
      await sleep(reply.typing_delay_ms);
    }

    const { message } = await appendServerMessage(this.app, {
      workspaceId,
      conversationId: conversation.id,
      role: "agent_ai",
      authorId: null,
      content: {
        type: "text",
        text,
        ...(reply.quick_replies ? { quickReplies: reply.quick_replies } : {}),
      },
    });

    // tracked_links 저장(메시지 id 연결).
    if (linkPlan.length > 0) {
      await this.app.repos.trackedLink.createMany(
        workspaceId,
        linkPlan.map((l) => ({
          conversationId: conversation.id,
          visitorId: conversation.visitorId,
          messageId: message.id,
          targetUrl: l.targetUrl,
          token: l.token,
        })),
      );
    }
    return text;
  }

  /** reply 실패 → 자동 핸드오프 + 기본 안내 + 실패 카운트 + auto_disable. */
  private async handleReplyFailure(
    agent: { id: string; name: string },
    vmCtx: VisitorMessageContext,
    request: AgentRequest,
    outcome: DispatchOutcome,
  ): Promise<void> {
    const isTimeout = outcome.kind === "timeout";
    const logOutcome = isTimeout ? "timeout" : "error";

    // 자동 핸드오프 + 방문자 기본 안내.
    await performHandoff(this.app, {
      workspaceId: vmCtx.workspaceId,
      conversation: vmCtx.conversation,
      eventType: "handoff_auto",
      reason: t("server.handoffAutoReason"),
      summary: null,
      messageToVisitor: t("server.autoHandoffNotice"),
      actor: `agent:${agent.id}`,
    });

    // 실패 카운트 증가 → 임계 도달 시 auto_disabled.
    const bumped = await this.app.repos.agent.bumpFailure(vmCtx.workspaceId, agent.id);
    if (bumped && bumped.failureCount >= AUTO_DISABLE_THRESHOLD) {
      await this.app.repos.agent.setStatus(vmCtx.workspaceId, agent.id, "auto_disabled");
      // TODO(question): owner 이메일 발송은 웹훅+배너로 대체(v1), 이메일은 M3 클라우드.
      this.app.webhookDispatcher.dispatch(vmCtx.workspaceId, "agent.auto_disabled", {
        agentId: agent.id,
        agentName: agent.name,
        failureCount: bumped.failureCount,
      });
      this.app.logger.warn(
        { agentId: agent.id, workspaceId: vmCtx.workspaceId },
        "커넥터 연속 실패로 auto_disabled — 웹훅+배너로 안내",
      );
    }

    await this.log(agent.id, vmCtx, request, logOutcome, {
      type: logOutcome,
      latencyMs: outcome.latencyMs,
      ...(outcome.kind === "http_error" ? { httpStatus: outcome.status } : {}),
    });
  }

  // ---------- assist 결과 처리 ----------
  private async handleAssistOutcome(
    agent: { id: string },
    vmCtx: VisitorMessageContext,
    request: AgentRequest,
    outcome: DispatchOutcome,
  ): Promise<void> {
    // assist의 모든 실패는 핸드오프 없이 조용히 스킵 + failure_count 미반영(05 문서).
    if (outcome.kind !== "ok" || !outcome.body.trim()) {
      await this.log(agent.id, vmCtx, request, outcome.kind === "timeout" ? "timeout" : "error", {
        type: "assist_error",
        latencyMs: outcome.latencyMs,
      });
      return;
    }

    let parsed;
    try {
      parsed = parseAgentResponse("assist", JSON.parse(outcome.body));
    } catch {
      await this.log(agent.id, vmCtx, request, "error", {
        type: "assist_bad_response",
        latencyMs: outcome.latencyMs,
      });
      return;
    }

    if (parsed.type === "suggest") {
      const row = await this.app.repos.assist.append(vmCtx.workspaceId, {
        conversationId: vmCtx.conversation.id,
        triggerMessageId: vmCtx.message.id,
        draft: parsed.draft,
        rationale: parsed.rationale ?? null,
        actions: parsed.actions ?? null,
        source: "agent",
      });
      // ⚠️ agents 채널로만 push(규칙 9).
      await this.app.broadcaster.suggestionNew(
        vmCtx.conversation.id,
        serializeSuggestion(row),
      );
      await this.log(agent.id, vmCtx, request, "suggest", {
        type: "suggest",
        textPreview: parsed.draft.slice(0, 500),
        latencyMs: outcome.latencyMs,
        httpStatus: outcome.status,
      });
    } else {
      // noop
      await this.log(agent.id, vmCtx, request, "noop", {
        type: "noop",
        latencyMs: outcome.latencyMs,
        httpStatus: outcome.status,
      });
    }
  }

  // ---------- agent_logs 요약 기록(시크릿·전문 저장 금지) ----------
  private async log(
    agentId: string,
    vmCtx: VisitorMessageContext,
    request: AgentRequest,
    outcome: "reply" | "handoff" | "noop" | "suggest" | "timeout" | "error",
    responseSummary: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.app.repos.agentLog.append(vmCtx.workspaceId, {
        agentId,
        conversationId: vmCtx.conversation.id,
        messageId: vmCtx.message.id,
        mode: request.mode,
        requestSummary: {
          messageText: request.message.text.slice(0, 200),
          historyCount: request.history.length,
        },
        responseSummary,
        outcome,
      });
    } catch (err) {
      this.app.logger.error({ err: (err as Error).message }, "agent_logs 기록 실패");
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
