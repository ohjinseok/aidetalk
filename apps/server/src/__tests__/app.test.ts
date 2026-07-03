import { describe, expect, it } from "vitest";

import { app } from "../app";

describe("GET /healthz", () => {
  it("200과 { ok: true }를 반환한다", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
