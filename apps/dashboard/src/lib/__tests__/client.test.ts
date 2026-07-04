import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, apiFetch } from "../api/client";

const schema = z.object({ ok: z.boolean() });

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(status: number, body: unknown) {
  const hasBody = body !== undefined && status !== 204;
  const res = new Response(hasBody ? JSON.stringify(body) : null, {
    status,
    headers: { "content-type": "application/json" },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(res)),
  );
}

describe("apiFetch", () => {
  it("성공 응답을 스키마로 파싱한다", async () => {
    mockFetchOnce(200, { ok: true });
    const out = await apiFetch("/v1/x", schema);
    expect(out).toEqual({ ok: true });
  });

  it("에러 봉투를 ApiError로 변환한다(code 보존)", async () => {
    mockFetchOnce(403, { error: { code: "auth/forbidden", message: "no" } });
    await expect(apiFetch("/v1/x", schema)).rejects.toMatchObject({
      code: "auth/forbidden",
      httpStatus: 403,
    });
  });

  it("스키마 불일치는 agent/bad_response로 던진다", async () => {
    mockFetchOnce(200, { ok: "not-a-boolean" });
    await expect(apiFetch("/v1/x", schema)).rejects.toBeInstanceOf(ApiError);
  });

  it("네트워크 실패는 code=network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("down"))),
    );
    await expect(apiFetch("/v1/x", schema)).rejects.toMatchObject({ code: "network" });
  });

  it("204는 스키마 없이 통과한다", async () => {
    mockFetchOnce(204, undefined);
    await expect(apiFetch("/v1/x", null, { method: "POST" })).resolves.toBeUndefined();
  });
});
