/**
 * 텔레메트리 opt-in — 11_ROADMAP.md M2 / 10_DEPLOYMENT.md 텔레메트리 표.
 * 기본 OFF: enabled=false면 전송 0건. ON이어도 페이로드에는 개수만 실리고 PII는 절대 없다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createTelemetryReporter } from "../services/telemetry";
import { createHarness, newVisitorSession, type Harness } from "../../test/harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe("텔레메트리 opt-in", () => {
  it("enabled=false(기본 OFF)면 start()/reportOnce() 모두 전송 0건", async () => {
    const fetchImpl = vi.fn();
    const reporter = createTelemetryReporter({
      enabled: false,
      endpoint: "https://telemetry.example.invalid/ping",
      version: "1.2.3",
      repos: h.ctx.repos,
      logger: h.ctx.logger,
      fetchImpl,
    });

    reporter.start();
    await reporter.reportOnce();
    reporter.stop();

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("enabled=true면 페이로드에 개수만 담기고 PII/워크스페이스 식별자는 전혀 없다", async () => {
    // 실제 PII가 있는 방문자를 하나 만들어 페이로드에 절대 섞이지 않음을 검증한다.
    const s = await newVisitorSession(h);
    await h.ctx.repos.visitor.updateProfile(s.workspaceId, s.visitorId, {
      email: "telemetry-pii-check@example.com",
      name: "텔레메트리유출테스트",
      phone: "010-0000-0000",
    });

    const fetchImpl = vi.fn().mockResolvedValue(undefined);
    const reporter = createTelemetryReporter({
      enabled: true,
      endpoint: "https://telemetry.example.invalid/ping",
      version: "1.2.3",
      repos: h.ctx.repos,
      logger: h.ctx.logger,
      fetchImpl,
    });

    await reporter.reportOnce();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://telemetry.example.invalid/ping");
    expect(init.method).toBe("POST");

    const raw = init.body as string;
    const payload = JSON.parse(raw);

    expect(typeof payload.anonymousId).toBe("string");
    expect(payload.anonymousId.length).toBeGreaterThan(0);
    expect(payload.version).toBe("1.2.3");
    expect(typeof payload.counts.workspaces).toBe("number");
    expect(typeof payload.counts.conversations).toBe("number");
    expect(typeof payload.counts.agents).toBe("number");
    expect(payload.counts.workspaces).toBeGreaterThanOrEqual(1);

    // 필드가 딱 이 3개뿐 — 그 외 어떤 내용/식별자/PII도 실리지 않는다.
    expect(Object.keys(payload).sort()).toEqual(["anonymousId", "counts", "version"]);
    expect(Object.keys(payload.counts).sort()).toEqual(["agents", "conversations", "workspaces"]);

    // 방금 저장한 PII/워크스페이스 식별자가 문자 그대로 어디에도 없음을 이중 확인.
    expect(raw).not.toContain("telemetry-pii-check@example.com");
    expect(raw).not.toContain("텔레메트리유출테스트");
    expect(raw).not.toContain("010-0000-0000");
    expect(raw).not.toContain(s.workspaceId);
    expect(raw).not.toContain(s.visitorId);
  });

  it("실패한 전송은 조용히 무시한다(reportOnce는 throw하지 않음)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const reporter = createTelemetryReporter({
      enabled: true,
      endpoint: "https://telemetry.example.invalid/ping",
      version: "1.2.3",
      repos: h.ctx.repos,
      logger: h.ctx.logger,
      fetchImpl,
    });

    await expect(reporter.reportOnce()).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("인스턴스 익명 ID는 재조회해도 동일하게 유지된다(멱등)", async () => {
    const id1 = await h.ctx.repos.instance.getOrCreateAnonymousId();
    const id2 = await h.ctx.repos.instance.getOrCreateAnonymousId();
    expect(id1).toBe(id2);
  });
});
