/**
 * 서버 버전 단일 출처 — apps/server/package.json의 version을 읽는다(10 §5).
 * healthz 응답과 텔레메트리 리포트가 동일 값을 쓰도록 여기서만 읽는다.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** src/lib/version.ts(→ dist/lib/version.js) 기준 상대 위치의 package.json version. */
export function readServerVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
