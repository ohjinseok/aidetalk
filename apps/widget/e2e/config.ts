/**
 * E2E 공통 상수 — 포트/URL/런타임 파일 경로.
 * 서버 단위 통합 테스트(포트 54331)와 겹치지 않도록 별도 포트를 쓴다.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PG_CONTAINER = "aidetalk-e2e-pg";
export const PG_PORT = 54332;
export const DATABASE_URL = `postgres://postgres:postgres@localhost:${PG_PORT}/aidetalk_e2e`;

export const SERVER_PORT = 4610;
export const AGENT_PORT = 4611;
export const HOST_PORT = 4612;

export const SERVER_URL = `http://localhost:${SERVER_PORT}`;
export const HOST_URL = `http://localhost:${HOST_PORT}`;
export const AGENT_URL = `http://127.0.0.1:${AGENT_PORT}/agent`;

/** globalSetup이 기록하고 spec/globalTeardown이 읽는 런타임 정보. */
export const RUNTIME_FILE = join(here, ".runtime.json");

export interface Runtime {
  serverUrl: string;
  hostUrl: string;
  workspaceId: string;
  pids: number[];
  container: string;
}
