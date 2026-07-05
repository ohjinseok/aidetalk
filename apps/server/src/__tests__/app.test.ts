/**
 * healthz — createApp(ctx)로 조립한 실제 앱이 200 + package.json 버전을 반환하는지 확인.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHarness, type Harness } from "../../test/harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe("GET /healthz", () => {
  it("200과 { ok: true, version }을 반환한다", async () => {
    const res = await fetch(`${h.baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(body.version).toBe(h.ctx.version);
  });
});
