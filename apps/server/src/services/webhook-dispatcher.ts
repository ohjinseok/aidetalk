/**
 * 웹훅 발송기 — 04_API_SPEC.md §2 웹훅 섹션 / 08_SECURITY.md §7("Agent와 동일 규약").
 *
 * - 서명: HMAC-SHA256(timestamp + "." + rawBody), X-AideTalk-Timestamp/Signature 헤더
 *   (agent dispatch의 dispatch/http.ts signBody와 동일 방식).
 * - 타임아웃 10s, 응답은 무시(fire-and-forget) — 상태코드만으로 성공/실패 판정.
 * - 실패 시 재시도 3회(1m/5m/30m).
 *   ⚠️ v1 한계: in-process setTimeout으로 예약한다 — 서버 재시작 시 예약된 재시도는 유실된다.
 *     내구성 있는 재시도가 필요해지면 별도 큐/저장 테이블 도입 필요(TODO 후속 웨이브).
 * - 구독하지 않은 이벤트/워크스페이스에 웹훅이 없으면 아무 것도 하지 않는다.
 * - 응답 본문/시크릿은 로그에 남기지 않는다(CLAUDE.md 규칙 5).
 */
import { decryptSecret } from "@aidetalk/db";

import type { AppContext } from "../context";
import { signBody } from "../dispatch/http";
import { resolveSecretEncKeyMaterial } from "../lib/secret-enc-key";
import type { WebhookEventName } from "../http/schemas";

export type { WebhookEventName };

/** 실패 시 재시도 지연(ms) — 1분/5분/30분(08 §7 "재시도 3회"). */
export const WEBHOOK_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;

/** 웹훅 HTTP 타임아웃(ms). */
export const WEBHOOK_TIMEOUT_MS = 10_000;

interface WebhookRow {
  id: string;
  workspaceId: string;
  url: string;
  secretEnc: string | null;
}

export interface WebhookDispatcher {
  /**
   * 워크스페이스의 구독 웹훅에 이벤트를 발송한다(fire-and-forget — 호출측은 await하지 않는다).
   * 구독하지 않은 웹훅은 스킵.
   */
  dispatch(workspaceId: string, event: WebhookEventName, data: Record<string, unknown>): void;
  /**
   * 테스트용 — 진행 중인 발송이 종결(성공 또는 재시도 소진)될 때까지 대기.
   * 재시도가 스케줄되면 그 지연까지 대기하게 되므로, 재시도 스케줄 자체를 검증할 때는
   * 호출하지 말고 HttpWebhookDispatcher를 짧은 retryDelaysMs로 생성해 직접 진행시킨다.
   */
  whenIdle?(): Promise<void>;
}

/** 셀프호스팅/테스트 기본값 — 아무 것도 하지 않는다. */
export class NoopWebhookDispatcher implements WebhookDispatcher {
  dispatch(): void {
    // 발송 없음.
  }
}

export interface HttpWebhookDispatcherOptions {
  /** 재시도 지연(ms) 오버라이드 — 테스트에서 실제 시간 없이 스케줄을 검증할 때만 사용. */
  retryDelaysMs?: readonly number[];
}

/** 실제 HTTP 발송 구현. */
export class HttpWebhookDispatcher implements WebhookDispatcher {
  private inflight = new Set<Promise<void>>();
  private readonly retryDelaysMs: readonly number[];

  constructor(
    private readonly app: AppContext,
    options: HttpWebhookDispatcherOptions = {},
  ) {
    this.retryDelaysMs = options.retryDelaysMs ?? WEBHOOK_RETRY_DELAYS_MS;
  }

  dispatch(workspaceId: string, event: WebhookEventName, data: Record<string, unknown>): void {
    const p = this.run(workspaceId, event, data).catch((err) => {
      this.app.logger.error({ err: (err as Error).message }, "웹훅 발송 처리 실패");
    });
    this.inflight.add(p);
    void p.finally(() => this.inflight.delete(p));
  }

  /** 진행 중인 발송이 종결(성공/재시도 소진)될 때까지 대기(테스트 결정성). */
  async whenIdle(): Promise<void> {
    await Promise.all([...this.inflight]);
  }

  private async run(
    workspaceId: string,
    event: WebhookEventName,
    data: Record<string, unknown>,
  ): Promise<void> {
    const webhooks = await this.app.repos.webhook.listSubscribed(workspaceId, event);
    if (webhooks.length === 0) return;

    const occurredAt = new Date().toISOString();
    const rawBody = JSON.stringify({ event, data, occurredAt });

    await Promise.all(webhooks.map((webhook) => this.sendWithRetry(webhook, rawBody, 0)));
  }

  private async sendWithRetry(webhook: WebhookRow, rawBody: string, attempt: number): Promise<void> {
    if (!webhook.secretEnc) {
      this.app.logger.error(
        { webhookId: webhook.id },
        "웹훅 secret 없음(서명 불가) — 발송 스킵",
      );
      return;
    }

    let secret: string;
    try {
      secret = decryptSecret(webhook.secretEnc, resolveSecretEncKeyMaterial(this.app.env));
    } catch {
      this.app.logger.error({ webhookId: webhook.id }, "웹훅 secret 복호화 실패 — 발송 스킵");
      return;
    }

    const ok = await this.postOnce(webhook.url, secret, rawBody);
    if (ok) return;

    if (attempt >= this.retryDelaysMs.length) {
      this.app.logger.warn(
        { webhookId: webhook.id, attempt },
        "웹훅 발송 재시도 소진 — 포기",
      );
      return;
    }

    const delayMs = this.retryDelaysMs[attempt]!;
    await new Promise<void>((resolve) => {
      // ⚠️ v1: in-process setTimeout 재시도. 서버 재시작 시 예약된 재시도는 유실된다.
      const timer = setTimeout(() => {
        this.sendWithRetry(webhook, rawBody, attempt + 1)
          .catch((err) => {
            this.app.logger.error({ err: (err as Error).message }, "웹훅 재시도 처리 실패");
          })
          .finally(resolve);
      }, delayMs);
      timer.unref?.();
    });
  }

  /** 서명된 POST 1회. 응답 본문은 읽지 않는다(fire-and-forget) — status<300만 성공 처리. */
  private async postOnce(url: string, secret: string, rawBody: string): Promise<boolean> {
    const timestampSec = Math.floor(Date.now() / 1000);
    const { timestamp, signature } = signBody(secret, rawBody, timestampSec);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-aidetalk-timestamp": timestamp,
          "x-aidetalk-signature": signature,
        },
        body: rawBody,
      });
      return res.status < 300;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
