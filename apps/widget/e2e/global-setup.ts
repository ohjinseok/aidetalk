/**
 * Playwright globalSetup — 위젯↔서버 통합 E2E 하네스(09_TESTING.md §7).
 *
 * 순서:
 *  1) 임시 Postgres(docker) 기동 + pg_isready 폴링.
 *  2) 스텁 에이전트 + 위젯 정적 호스트(servers.mjs) spawn.
 *  3) AideTalk 서버(tsx, PUBSUB_DRIVER=memory, 부팅 시 마이그레이션) spawn.
 *  4) /healthz·호스트 준비 폴링.
 *  5) HTTP로 시드: 유저 → 워크스페이스(s1) → widgetSettings → active 에이전트(스텁).
 *  6) 런타임 정보(.runtime.json) 기록 — spec/globalTeardown이 읽는다.
 */
import { spawn, execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGENT_PORT,
  AGENT_URL,
  DATABASE_URL,
  HOST_PORT,
  HOST_URL,
  PG_CONTAINER,
  PG_PORT,
  RUNTIME_FILE,
  SERVER_PORT,
  SERVER_URL,
  type Runtime,
} from "./config";

const here = dirname(fileURLToPath(import.meta.url));
const widgetDir = join(here, "..");
const serverDir = join(widgetDir, "..", "server");
const tsxBin = join(serverDir, "node_modules", ".bin", "tsx");

const VISITOR_SECRET = "e2e_visitor_secret_at_least_16_chars";
const SESSION_SECRET = "e2e_session_secret_at_least_16_chars";

function sh(cmd: string, args: string[], opts: { ignoreError?: boolean } = {}): string {
  try {
    return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
  } catch (err) {
    if (opts.ignoreError) return "";
    throw err;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(label: string, fn: () => Promise<boolean>, timeoutMs = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) return;
    } catch {
      /* 재시도 */
    }
    await sleep(500);
  }
  throw new Error(`E2E 준비 실패(타임아웃): ${label}`);
}

async function startPostgres(): Promise<void> {
  sh("docker", ["rm", "-f", PG_CONTAINER], { ignoreError: true });
  sh("docker", [
    "run", "-d", "--name", PG_CONTAINER,
    "-e", "POSTGRES_PASSWORD=postgres",
    "-e", "POSTGRES_DB=aidetalk_e2e",
    "-p", `${PG_PORT}:5432`,
    "postgres:16-alpine",
  ]);
  await waitFor("postgres", async () => {
    const out = sh("docker", ["exec", PG_CONTAINER, "pg_isready", "-U", "postgres"], {
      ignoreError: true,
    });
    return out.includes("accepting connections");
  });
  await sleep(500); // 초기화 여유
}

// ---------- HTTP 시드 헬퍼 ----------
async function seedWorkspace(): Promise<string> {
  const email = `e2e_${Date.now()}@example.com`;
  const signup = await fetch(`${SERVER_URL}/v1/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password123", name: "E2E 상담원" }),
  });
  if (!signup.ok) throw new Error(`signup 실패: ${signup.status}`);
  const setCookie = signup.headers.getSetCookie().find((c) => c.startsWith("od_session="));
  if (!setCookie) throw new Error("세션 쿠키를 받지 못했다.");
  const cookie = setCookie.split(";")[0];

  const authed = (path: string, body: unknown, method = "POST") =>
    fetch(`${SERVER_URL}${path}`, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });

  const wsRes = await authed("/v1/workspaces", { name: "E2E 가게", segment: "s1_site" });
  if (!wsRes.ok) throw new Error(`workspace 생성 실패: ${wsRes.status}`);
  const wsId = ((await wsRes.json()) as { workspace: { id: string } }).workspace.id;

  const settingsRes = await authed(
    `/v1/workspaces/${wsId}/settings`,
    { widgetSettings: { greeting: "무엇을 도와드릴까요?", primaryColor: "#4F46E5" } },
    "PATCH",
  );
  if (!settingsRes.ok) throw new Error(`settings 갱신 실패: ${settingsRes.status}`);

  const agentRes = await authed(`/v1/workspaces/${wsId}/agents`, {
    name: "e2e-agent",
    endpointUrl: AGENT_URL,
  });
  if (!agentRes.ok) throw new Error(`agent 생성 실패: ${agentRes.status} ${await agentRes.text()}`);
  const agentId = ((await agentRes.json()) as { agent: { id: string } }).agent.id;

  const activateRes = await authed(
    `/v1/workspaces/${wsId}/agents/${agentId}`,
    { status: "active" },
    "PATCH",
  );
  if (!activateRes.ok) throw new Error(`agent 활성화 실패: ${activateRes.status}`);

  return wsId;
}

export default async function globalSetup(): Promise<void> {
  const pids: number[] = [];

  await startPostgres();

  // 스텁 에이전트 + 정적 호스트.
  const servers = spawn("node", [join(here, "servers.mjs")], {
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_AGENT_PORT: String(AGENT_PORT),
      E2E_HOST_PORT: String(HOST_PORT),
    },
  });
  if (servers.pid) pids.push(servers.pid);

  // AideTalk 서버(tsx). 부팅 시 마이그레이션.
  const server = spawn(tsxBin, ["src/index.ts"], {
    cwd: serverDir,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL,
      PUBSUB_DRIVER: "memory",
      SERVER_URL,
      DASHBOARD_URL: "http://localhost:3000",
      VISITOR_TOKEN_SECRET: VISITOR_SECRET,
      SESSION_SECRET,
      PORT: String(SERVER_PORT),
      RUN_MIGRATIONS_ON_BOOT: "true",
      STORAGE_LOCAL_PATH: join(here, ".tmp-files"),
      LOG_LEVEL: "warn",
    },
  });
  if (server.pid) pids.push(server.pid);

  await waitFor("server /healthz", async () => {
    const res = await fetch(`${SERVER_URL}/healthz`);
    return res.ok;
  });
  await waitFor("widget host", async () => {
    const res = await fetch(`${HOST_URL}/host.html`);
    return res.ok;
  });

  const workspaceId = await seedWorkspace();

  const runtime: Runtime = {
    serverUrl: SERVER_URL,
    hostUrl: HOST_URL,
    workspaceId,
    pids,
    container: PG_CONTAINER,
  };
  writeFileSync(RUNTIME_FILE, JSON.stringify(runtime, null, 2));
}
