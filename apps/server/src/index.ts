/**
 * 서버 부팅 엔트리 — env 검증 → DB 연결(+옵션 마이그레이션) → 어댑터 조립 → HTTP+WS 기동.
 * 10_DEPLOYMENT.md §1/§2. 시크릿 값은 로그에 남기지 않는다(CLAUDE.md 규칙 5).
 */
import { serve } from "@hono/node-server";
import { createDbConnection, createRepos, runMigrations } from "@aidetalk/db";

import { createApp } from "./app";
import { createContext } from "./context";
import { parseEnv } from "./env";
import { createLogger } from "./logger";
import { createPubSub } from "./pubsub/index";
import { createRateLimiter } from "./ratelimit/index";
import { createSessionStore } from "./session/store";
import { createTelemetryReporter } from "./services/telemetry";
import { createGateway } from "./ws/gateway";

async function main(): Promise<void> {
  // 1) env 검증 — 실패 시 사유 출력 후 종료(값은 출력하지 않음).
  let env;
  try {
    env = parseEnv();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const logger = createLogger(env.LOG_LEVEL);

  // 2) DB 연결.
  const conn = createDbConnection(env.DATABASE_URL);

  // 3) (옵션) 부팅 시 마이그레이션.
  if (env.RUN_MIGRATIONS_ON_BOOT) {
    logger.info("마이그레이션 실행 중...");
    await runMigrations(env.DATABASE_URL);
    logger.info("마이그레이션 완료");
  }

  // 4) 연결 확인(가벼운 조회 — 없는 id 조회는 undefined 반환하며 연결만 검증).
  try {
    await createRepos(conn.db).workspace.getById("__boot_ping__");
    logger.info("DB 연결 확인");
  } catch (err) {
    logger.error({ err: (err as Error).message }, "DB 연결 실패");
    process.exit(1);
  }

  // 5) 어댑터 조립.
  const pubsub = createPubSub(env);
  const rateLimiter = createRateLimiter(env.REDIS_URL);
  const sessionStore = createSessionStore(env.REDIS_URL);
  const ctx = createContext({ env, db: conn.db, pubsub, rateLimiter, sessionStore, logger });

  // 5-1) 텔레메트리(opt-in, 기본 OFF) — TELEMETRY_ENABLED=true일 때만 주 1회 익명 통계 전송.
  const telemetry = createTelemetryReporter({
    enabled: env.TELEMETRY_ENABLED,
    endpoint: env.TELEMETRY_ENDPOINT,
    version: ctx.version,
    repos: ctx.repos,
    logger,
  });
  telemetry.start();

  // 6) HTTP + WS 기동.
  const app = createApp(ctx);
  const gateway = createGateway(ctx);

  const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info({ port: info.port }, "[server] http listening");
  });

  server.on("upgrade", (req, socket, head) => {
    gateway.handleUpgrade(req, socket, head);
  });

  // 7) graceful shutdown.
  const shutdown = async () => {
    logger.info("종료 중...");
    telemetry.stop();
    await gateway.close();
    await pubsub.close();
    await rateLimiter.close();
    await sessionStore.close();
    await conn.close();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
