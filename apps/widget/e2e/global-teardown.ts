/**
 * Playwright globalTeardown — 자식 프로세스 종료 + Postgres 컨테이너 삭제.
 * globalSetup이 기록한 .runtime.json을 읽어 정리한다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";

import { RUNTIME_FILE, type Runtime } from "./config";

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(RUNTIME_FILE)) return;
  let runtime: Runtime;
  try {
    runtime = JSON.parse(readFileSync(RUNTIME_FILE, "utf8")) as Runtime;
  } catch {
    return;
  }

  for (const pid of runtime.pids ?? []) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* 이미 종료됨 */
    }
  }

  if (runtime.container) {
    try {
      execFileSync("docker", ["rm", "-f", runtime.container], { stdio: "ignore" });
    } catch {
      /* 무시 */
    }
  }

  try {
    rmSync(RUNTIME_FILE);
  } catch {
    /* 무시 */
  }
}
