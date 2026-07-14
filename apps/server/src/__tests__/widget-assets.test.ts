/**
 * 위젯 정적 자산 서빙(/widget.js, /widget/v{n}/app.js) — 06 §1.1, 10 §3.
 * 셀프호스팅에서 이 라우트가 없으면 임베드 코드가 404가 되어 위젯이 아예 뜨지 않는다.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WIDGET_VERSION } from "@aidetalk/shared";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWidgetAssetRoutes } from "../routes/widget-assets";

/** 산출물이 있는 앱(정상 배포)과 없는 앱(위젯 미빌드)을 각각 만든다. */
let distDir: string;
let served: Hono;
const missing = new Hono().route("/", createWidgetAssetRoutes(null));

beforeAll(async () => {
  distDir = await mkdtemp(join(tmpdir(), "aidetalk-widget-"));
  await writeFile(join(distDir, "widget.js"), "/* loader */");
  await writeFile(join(distDir, "app.js"), "/* app */");
  served = new Hono().route("/", createWidgetAssetRoutes(distDir));
});
afterAll(async () => {
  await rm(distDir, { recursive: true, force: true });
});

describe("GET /widget.js (로더)", () => {
  it("200 + JS content-type + 짧은 캐시(max-age=300)", async () => {
    const res = await served.request("/widget.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("/* loader */");
  });

  it("산출물이 없으면 404(서버는 정상 동작)", async () => {
    const res = await missing.request("/widget.js");
    expect(res.status).toBe(404);
  });
});

describe("GET /widget/v{n}/app.js (본체)", () => {
  it("현재 버전은 200 + immutable 장기 캐시", async () => {
    const res = await served.request(`/widget/v${WIDGET_VERSION}/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toBe("/* app */");
  });

  it("모르는 버전은 404", async () => {
    const res = await served.request("/widget/v99/app.js");
    expect(res.status).toBe(404);
  });

  it("산출물이 없으면 404", async () => {
    const res = await missing.request(`/widget/v${WIDGET_VERSION}/app.js`);
    expect(res.status).toBe(404);
  });
});
