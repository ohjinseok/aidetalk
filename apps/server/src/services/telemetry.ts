/**
 * 텔레메트리 — opt-in 전용(기본 OFF). 10_DEPLOYMENT.md 텔레메트리 표 / 11_ROADMAP.md M2.
 *
 * `TELEMETRY_ENABLED=true`일 때만 동작한다. 수집 항목은 최소한의 익명 통계뿐이다:
 * - 인스턴스 익명 ID(랜덤 생성 후 DB 저장, instanceRepo.getOrCreateAnonymousId)
 * - 서버 버전
 * - 워크스페이스/대화/에이전트 "개수"만 — 내용·PII는 절대 포함하지 않는다.
 * 주 1회 전송. 전송 실패(네트워크 오류 등)는 조용히 무시하며 서버 동작에 영향을 주지 않는다.
 *
 * TODO(action): `TELEMETRY_ENDPOINT` 기본값은 placeholder 도메인이다(env.ts). 실제 수집 서버
 * 도메인이 확정되면 그 기본값과 10_DEPLOYMENT.md/설치 가이드를 같은 커밋에서 갱신할 것.
 */
import type { Repos } from "@aidetalk/db";

import type { Logger } from "../logger";

/** 전송 주기 — 주 1회. */
export const TELEMETRY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** 텔레메트리 페이로드 — 개수만 포함, 대화/메시지 내용이나 이메일 등 PII는 절대 포함하지 않는다. */
export interface TelemetryPayload {
  anonymousId: string;
  version: string;
  counts: {
    workspaces: number;
    conversations: number;
    agents: number;
  };
}

export interface TelemetryReporter {
  /** 활성화 시 즉시 1회 전송 + 이후 주기 전송 시작. 비활성화면 아무 것도 하지 않는다. */
  start(): void;
  /** graceful shutdown에서 호출 — 예약된 타이머 해제. */
  stop(): void;
  /** 테스트/수동 트리거용 1회 전송. 성공/실패와 무관하게 항상 resolve된다. */
  reportOnce(): Promise<void>;
}

export interface CreateTelemetryReporterOptions {
  /** TELEMETRY_ENABLED. false면 NoopTelemetryReporter를 반환(전송 0건 보장). */
  enabled: boolean;
  endpoint: string;
  version: string;
  repos: Repos;
  logger: Logger;
  /** 전송 주기(ms) 오버라이드 — 테스트용. 기본 TELEMETRY_INTERVAL_MS(주 1회). */
  intervalMs?: number;
  /** 테스트에서 실제 네트워크 호출을 가로채기 위한 주입점. 기본은 전역 fetch. */
  fetchImpl?: typeof fetch;
}

/** 비활성 상태 — start/reportOnce 전부 아무 것도 하지 않는다(opt-in 기본 OFF 보장). */
class NoopTelemetryReporter implements TelemetryReporter {
  start(): void {
    // 텔레메트리 비활성 — 아무 것도 하지 않는다.
  }
  stop(): void {
    // 시작한 적이 없으므로 해제할 것도 없다.
  }
  async reportOnce(): Promise<void> {
    // 비활성 상태에서는 전송하지 않는다.
  }
}

class HttpTelemetryReporter implements TelemetryReporter {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly intervalMs: number;

  constructor(
    private readonly opts: Omit<CreateTelemetryReporterOptions, "fetchImpl" | "intervalMs">,
    intervalMs: number,
    fetchImpl: typeof fetch,
  ) {
    this.intervalMs = intervalMs;
    this.fetchImpl = fetchImpl;
  }

  start(): void {
    void this.reportOnce();
    this.timer = setInterval(() => void this.reportOnce(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async reportOnce(): Promise<void> {
    try {
      const anonymousId = await this.opts.repos.instance.getOrCreateAnonymousId();
      const counts = await this.opts.repos.instance.getCounts();
      const payload: TelemetryPayload = { anonymousId, version: this.opts.version, counts };
      await this.fetchImpl(this.opts.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // 전송 실패는 조용히 무시한다 — 서버 운영에 영향을 주지 않는다.
      this.opts.logger.debug({ err: (err as Error).message }, "텔레메트리 전송 실패(무시)");
    }
  }
}

/** enabled=false면 항상 NoopTelemetryReporter — opt-in 기본 OFF를 타입/구조로도 보장한다. */
export function createTelemetryReporter(opts: CreateTelemetryReporterOptions): TelemetryReporter {
  if (!opts.enabled) return new NoopTelemetryReporter();
  return new HttpTelemetryReporter(
    opts,
    opts.intervalMs ?? TELEMETRY_INTERVAL_MS,
    opts.fetchImpl ?? fetch,
  );
}
