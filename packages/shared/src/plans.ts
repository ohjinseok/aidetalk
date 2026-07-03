/**
 * 플랜 상수 + 코어/유료 경계 인터페이스 — 01_BUSINESS_MODEL.md §3, §4.
 * 이 파일이 플랜 정의의 단일 출처다.
 *
 * ⚠️ CLAUDE.md 절대 규칙 8: 코어(ee/ 밖)는 ee/를 import하지 않는다.
 * 여기서는 인터페이스만 정의하고, ee/가 구현체(CloudPlanEnforcer, BillingProvider)를 주입한다.
 */

/** 01 문서 §3 — 플랜별 한도(v1 확정값). 무제한은 Infinity. */
export const PLANS = {
  oss: {
    id: "oss",
    priceKrw: 0,
    includedSeats: Infinity,
    extraSeatPriceKrw: 0,
    monthlyConversationLimit: Infinity,
    agentLogRetentionDays: Infinity,
  },
  starter: {
    id: "starter",
    priceKrw: 29_000,
    includedSeats: 3,
    extraSeatPriceKrw: 9_000,
    monthlyConversationLimit: 1_000,
    agentLogRetentionDays: 30,
  },
  pro: {
    id: "pro",
    priceKrw: 79_000,
    includedSeats: 10,
    extraSeatPriceKrw: 9_000,
    monthlyConversationLimit: 10_000,
    agentLogRetentionDays: 90,
  },
} as const;

export type PlanId = keyof typeof PLANS;

/**
 * 플랜 한도 강제 인터페이스 — 01 문서 §4.
 * 코어는 이 인터페이스만 안다. 셀프호스팅은 NoopPlanEnforcer, 클라우드는 ee/의 CloudPlanEnforcer.
 */
export interface PlanEnforcer {
  /** 새 대화 생성 직전 호출. 초과 시 AppError("plan/limit_exceeded", 402) throw. */
  assertCanCreateConversation(workspaceId: string): Promise<void>;
  /** 멤버 초대 직전 호출. 초과 시 AppError("plan/limit_exceeded", 402) throw. */
  assertCanAddSeat(workspaceId: string): Promise<void>;
  /** agent_logs 정리 배치가 참조할 보존 일수. 셀프호스팅은 Infinity. */
  getLogRetentionDays(workspaceId: string): Promise<number>;
}

/**
 * 셀프호스팅 기본 구현 — 전부 통과, 보존일 Infinity.
 * 셀프호스팅에는 어떤 제한도 걸지 않는다(01 문서 §2 원칙).
 */
export class NoopPlanEnforcer implements PlanEnforcer {
  async assertCanCreateConversation(_workspaceId: string): Promise<void> {
    // 제한 없음
  }

  async assertCanAddSeat(_workspaceId: string): Promise<void> {
    // 제한 없음
  }

  async getLogRetentionDays(_workspaceId: string): Promise<number> {
    return Infinity;
  }
}

/**
 * 결제 인터페이스 — 01 문서 §6. PG 중립.
 * 코어는 이 인터페이스만 알고, 구현은 ee/billing 안에서만 특정 PG API를 호출한다.
 */
export interface BillingProvider {
  /** 카드/결제수단 등록 UI로 보낼 URL 또는 위젯 파라미터 생성. */
  createRegistrationSession(
    wsId: string,
    plan: PlanId,
    returnUrl: string,
  ): Promise<{ redirectUrl: string }>;
  /** 등록 완료 콜백 처리 → 재사용 가능한 결제수단 토큰 반환(암호화 저장은 호출측 책임). */
  completeRegistration(
    callbackParams: Record<string, string>,
  ): Promise<{ paymentMethodToken: string }>;
  /** 저장된 토큰으로 청구. idempotencyKey는 sub_id + period로 호출측이 생성. */
  charge(
    token: string,
    amountKrw: number,
    idempotencyKey: string,
  ): Promise<{ ok: true; receiptId: string } | { ok: false; reason: string }>;
}
