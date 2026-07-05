/**
 * AppContext — 서버 전역 의존성 묶음(주입 컨테이너).
 * 라우트/WS 게이트웨이는 이 컨텍스트만 받아 동작해 테스트에서 어댑터를 갈아끼울 수 있다.
 *
 * ⚠️ CLAUDE.md 규칙 8: 코어는 ee/를 import하지 않는다. PlanEnforcer는 인터페이스로만 주입.
 */
import { createRepos, type Database, type Repos } from "@aidetalk/db";
import { NoopPlanEnforcer, type PlanEnforcer } from "@aidetalk/shared";

import { createBroadcaster, type Broadcaster } from "./broadcaster";
import { HttpAgentDispatcher, type AgentDispatcher } from "./dispatcher";
import type { Env } from "./env";
import { warnIfSecretEncKeyMissing } from "./lib/secret-enc-key";
import { createLogger, type Logger } from "./logger";
import type { ClosablePubSub } from "./pubsub";
import type { RateLimiter } from "./ratelimit";
import type { SessionStore } from "./session/store";
import { HttpWebhookDispatcher, type WebhookDispatcher } from "./services/webhook-dispatcher";

export interface AppContext {
  env: Env;
  logger: Logger;
  db: Database;
  repos: Repos;
  pubsub: ClosablePubSub;
  broadcaster: Broadcaster;
  rateLimiter: RateLimiter;
  sessionStore: SessionStore;
  planEnforcer: PlanEnforcer;
  dispatcher: AgentDispatcher;
  webhookDispatcher: WebhookDispatcher;
}

export interface CreateContextDeps {
  env: Env;
  db: Database;
  pubsub: ClosablePubSub;
  rateLimiter: RateLimiter;
  sessionStore: SessionStore;
  logger?: Logger;
  planEnforcer?: PlanEnforcer;
  dispatcher?: AgentDispatcher;
  webhookDispatcher?: WebhookDispatcher;
}

/** 주입된 어댑터로 AppContext를 조립한다. repos/broadcaster는 여기서 파생. */
export function createContext(deps: CreateContextDeps): AppContext {
  const logger = deps.logger ?? createLogger(deps.env.LOG_LEVEL);
  // 부팅 시 1회 — SECRET_ENC_KEY 미설정이면 폴백 안내(08 §1).
  warnIfSecretEncKeyMissing(deps.env, logger);
  const ctx: AppContext = {
    env: deps.env,
    logger,
    db: deps.db,
    repos: createRepos(deps.db),
    pubsub: deps.pubsub,
    broadcaster: createBroadcaster(deps.pubsub),
    rateLimiter: deps.rateLimiter,
    sessionStore: deps.sessionStore,
    // 셀프호스팅/테스트 기본값 — cloud는 index.ts에서 ee의 CloudPlanEnforcer 주입(다음 웨이브).
    planEnforcer: deps.planEnforcer ?? new NoopPlanEnforcer(),
    // 주입이 없으면 실제 HTTP 릴레이 dispatcher(ctx 참조 필요 → 조립 후 주입).
    dispatcher: deps.dispatcher ?? (undefined as unknown as AgentDispatcher),
    webhookDispatcher: deps.webhookDispatcher ?? (undefined as unknown as WebhookDispatcher),
  };
  if (!deps.dispatcher) ctx.dispatcher = new HttpAgentDispatcher(ctx);
  if (!deps.webhookDispatcher) ctx.webhookDispatcher = new HttpWebhookDispatcher(ctx);
  return ctx;
}
