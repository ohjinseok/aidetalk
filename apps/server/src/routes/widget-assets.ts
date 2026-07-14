/**
 * 위젯 정적 자산 서빙 — 로더(`/widget.js`)와 본체(`/widget/v{n}/app.js`).
 * 명세: 06_WIDGET_SPEC.md §1·§1.1, 10_DEPLOYMENT.md §3(위젯 정적 파일은 server 이미지에 포함).
 *
 * 왜 서버가 서빙하나: 임베드 스니펫이 `https://{host}/widget.js`를 가리키고, 로더가 같은 오리진의
 * `/widget/v{n}/app.js`를 로드한다(로더 소스 참고). 배포 단위를 서버 이미지 하나로 유지하기 위해
 * 위젯 산출물(apps/widget/dist)을 이미지에 넣고 여기서 그대로 내보낸다.
 *
 * 캐시 정책(06 §1.1: "로더는 max-age=300, 본체는 immutable"):
 *  - 로더: 짧은 캐시(300s). 유저 사이트의 <script> src가 고정이라 재배포 반영이 이 TTL에 걸린다.
 *  - 본체: URL에 버전이 박힌 불변 자산 → 1년 immutable. 새 버전은 새 URL로 배포된다.
 *
 * CORS: <script> 태그 로드는 CORS 대상이 아니므로 헤더가 필요 없다. 다만 일부 호스트 사이트가
 * crossorigin 속성이나 CSP로 fetch 형태 로드를 강제하는 경우가 있어, 정적 JS에 한해
 * `Access-Control-Allow-Origin: *`를 붙여둔다(비밀·쿠키가 없는 공개 자산이라 안전).
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { WIDGET_VERSION } from "@aidetalk/shared";
import { Hono } from "hono";

import type { HonoEnv } from "../http/types";

/** JS 자산 공통 헤더. nosniff — 스니핑으로 인한 MIME 혼동 차단. */
const JS_CONTENT_TYPE = "text/javascript; charset=utf-8";

/**
 * 위젯 산출물 디렉터리를 찾는다. packages/db의 마이그레이션 폴더와 같은 전략:
 * import.meta.url 기준 상대 경로 후보를 순회하고, 실제 존재하는 첫 디렉터리를 쓴다.
 *
 *  - 프로덕션 번들: 이 코드는 /app/dist/index.js에 인라인되므로 `../widget` → `/app/widget`
 *    (docker/server.Dockerfile이 apps/widget/dist를 거기로 COPY한다).
 *  - 개발(tsx, apps/server/src/routes/): `../../../widget/dist` → apps/widget/dist.
 *
 * 어느 후보도 없으면 null — 라우트는 등록되되 모든 요청이 404가 된다(부팅 실패 아님).
 */
export function resolveWidgetDistDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "widget"), // 번들: /app/dist → /app/widget
    join(here, "..", "..", "..", "widget", "dist"), // dev: apps/server/src/routes → apps/widget/dist
  ];
  return candidates.find((dir) => existsSync(dir)) ?? null;
}

/**
 * 위젯 자산 라우트. distDir가 null이거나 파일이 없으면 404(서버는 정상 기동).
 * distDir 인자는 테스트 주입용 — 프로덕션에서는 resolveWidgetDistDir()가 결정한다.
 */
export function createWidgetAssetRoutes(
  distDir: string | null = resolveWidgetDistDir(),
): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  app.get("/widget.js", async (c) => {
    const body = await readAsset(distDir, "widget.js");
    if (!body) return notFound(c.get("ctx")?.logger, distDir, "widget.js");
    // 로더는 유저 사이트에 박힌 고정 URL — 짧은 캐시로 재배포가 5분 내 반영되게 한다(06 §1.1).
    return jsResponse(body, "public, max-age=300");
  });

  app.get("/widget/:version/app.js", async (c) => {
    // 서버가 가진 본체는 한 버전뿐 — 다른 버전 요청은 404(구버전 로더가 조용히 무동작).
    if (c.req.param("version") !== `v${WIDGET_VERSION}`) {
      return notFound(c.get("ctx")?.logger, distDir, "app.js");
    }
    const body = await readAsset(distDir, "app.js");
    if (!body) return notFound(c.get("ctx")?.logger, distDir, "app.js");
    // 버전이 URL에 있으므로 내용이 바뀌면 URL도 바뀐다 → 영구 캐시 가능(06 §1.1 immutable).
    return jsResponse(body, "public, max-age=31536000, immutable");
  });

  return app;
}

/** 산출물 파일을 읽는다. 없으면 null(로컬 dev에서 위젯 미빌드 등). */
async function readAsset(distDir: string | null, file: string): Promise<Buffer | null> {
  if (!distDir) return null;
  try {
    // 파일명이 라우트에 하드코딩된 리터럴뿐이라 경로 조작(../) 여지가 없다.
    return await readFile(join(distDir, file));
  } catch {
    return null;
  }
}

function jsResponse(body: Buffer, cacheControl: string): Response {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "content-type": JS_CONTENT_TYPE,
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*",
    },
  });
}

/** 자산 미존재 — 위젯이 안 뜨는 원인이라 로그를 남긴다(호스트 사이트에는 조용한 404). */
function notFound(
  logger: { warn: (obj: object, msg: string) => void } | undefined,
  distDir: string | null,
  file: string,
): Response {
  logger?.warn(
    { distDir, file },
    "위젯 자산을 찾을 수 없습니다 — 위젯 빌드(pnpm --filter @aidetalk/widget build)가 이미지에 포함됐는지 확인하세요",
  );
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
