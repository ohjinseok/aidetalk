# 01_BUSINESS_MODEL.md — 과금 모델과 코드 명세

> "어떻게 돈을 버는가"와 "그걸 코드로 어떻게 강제하는가"를 함께 정의한다.
> plan/billing 관련 구현은 전부 이 문서를 따른다.

## 1. 수익 구조 요약 (Open Core)

```
[무료 셀프호스팅 (AGPL)]  ──유입──▶  [GitHub Stars, 커뮤니티, 신뢰]
        │                                    │
        │ "운영(백업/도메인/모니터링/업데이트) 귀찮다"
        ▼                                    ▼
[유료 클라우드 (SaaS)] ◀──전환── Persona A 성장 / Persona B 직행
```

- **주 수익: 클라우드 구독료.** 셀프호스팅은 마케팅 채널이자 신뢰 자산이지 수익원이 아니다.
- **원가 구조의 핵심: LLM 호출·에이전트 실행을 절대 우리 인프라에서 하지 않는다(BYO).** 우리 원가는 서버+DB+대역폭뿐 → 목표 매출총이익률 80%+.
- **과금 단위는 딱 2개: 워크스페이스 플랜(월정액) + 초과 시트.** 채널톡의 MU/PU/CU/ALF 복잡 종량제의 정반대 포지션. "청구서가 예측된다"가 곧 마케팅 메시지.

## 2. 플랜 정의 (v1 확정값)

| | `oss` (셀프호스팅) | `starter` | `pro` |
|---|---|---|---|
| 가격 | 무료 | ₩29,000/월/워크스페이스 | ₩79,000/월/워크스페이스 |
| 포함 시트 | 무제한 | 3 (추가 시트 ₩9,000/월) | 10 (추가 시트 ₩9,000/월) |
| 월 대화 수 | 무제한 | 1,000 | 10,000 |
| AI Agent 커넥터 | ✅ | ✅ | ✅ |
| 전환 트래킹 | ✅ (클릭까지) | ✅ (+전환 스크립트 v1.5) | ✅ (+커머스 API v2) |
| 실시간 어시스트 | ✅ | ✅ | ✅ |
| agent_logs 보존 | 무제한(유저 디스크) | 30일 | 90일 |
| 클라우드 운영 | - | 자동 백업, 커스텀 도메인, 모니터링 | + 감사 로그, 우선지원, SLA |
| LLM 비용 | 유저 부담 | 유저 부담 | 유저 부담 |

원칙:
- **핵심 기능(커넥터/트래킹/어시스트)은 전 플랜 동일.** 기능으로 가르지 않고 규모(대화 수/시트)와 운영 편의로 가른다. → OSS 커뮤니티 반발("기능 인질") 회피.
- 셀프호스팅에는 어떤 제한도 걸지 않는다. license key 체크, 전화 홈, 기능 잠금 전부 금지.
- 부 수익(v2+, 지금 구현 금지): 알림톡 발송 마진, 매니지드 에이전트 호스팅, 템플릿/Skill 마켓.

## 3. 플랜 상수 (packages/shared/src/plans.ts — 이 코드가 단일 출처)

```ts
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
```

## 4. 코어와 유료 로직의 경계 — `PlanEnforcer` 인터페이스

**코어(AGPL)는 plan 제한 로직을 모른다.** 코어는 인터페이스만 알고, 구현은 두 개:

```ts
// packages/shared/src/plan-enforcer.ts (코어에 포함)
export interface PlanEnforcer {
  /** 새 대화 생성 직전 호출. 초과 시 AppError("plan/limit_exceeded", 402) throw */
  assertCanCreateConversation(workspaceId: string): Promise<void>;
  /** 멤버 초대 직전 호출 */
  assertCanAddSeat(workspaceId: string): Promise<void>;
  /** agent_logs 정리 배치가 참조할 보존 일수 */
  getLogRetentionDays(workspaceId: string): Promise<number>;
}

// apps/server 기본 구현 (코어): NoopPlanEnforcer — 전부 통과, Infinity 반환
// ee/plan-limits 구현 (클라우드): CloudPlanEnforcer — usage_counters 기반 검사
```

- 서버 부팅 시 `EDITION=cloud` 환경변수일 때만 `ee/`의 구현을 동적 import해 주입. `EDITION` 미설정(셀프호스팅)이면 Noop.
- **CLAUDE.md 절대 규칙 8**: `ee/` 밖 코드는 `ee/`를 import하지 않는다. 주입 지점은 서버 부팅 코드 한 곳뿐.

### 4.1 대화 수 카운팅 명세 (ee/plan-limits)
- 테이블 `usage_counters (workspace_id, period_yyyymm, conversation_count)` — `ee/` 전용 마이그레이션.
- 카운트 시점: **conversation 레코드 생성 성공 시 +1** (메시지 수 아님. 같은 대화의 메시지가 몇 개든 1건).
- 기간: 워크스페이스 결제 주기와 무관하게 **캘린더 월(KST)** 기준. 단순함 우선.
- 한도 도달 시 동작: 위젯에서 새 대화 생성 시 `402 plan/limit_exceeded` → 위젯은 i18n 키 `widget.limit_reached` 안내문 표시("현재 문의가 많아 새 상담을 시작할 수 없습니다..."). **기존 열린 대화는 계속 동작** (손님을 중간에 자르지 않는다).
- 한도 80% 도달 시 owner에게 이메일 1회 (기간당 1회, `usage_counters.warned_at`로 중복 방지).

### 4.2 시트 카운팅
- 시트 = `members` 중 status가 active인 수. 초대 수락 시점에 `assertCanAddSeat` 검사.
- 포함 시트 초과분은 다음 결제에 `extraSeatPriceKrw × 초과수` 가산 (일할 계산 안 함 — 단순함 우선, 문서에 명시).

## 5. 라이선스 구조

- **코어(레포 전체, `ee/` 제외): AGPL-3.0.** 근거: (a) 클라우드 무단 재판매를 억제하면서 셀프호스팅 자유 보장, (b) Chatwoot·Cal.com·n8n 계열의 검증된 구조, (c) 우리 고객(SMB 내부 사용)에게 AGPL은 부담 없음.
- **`ee/` 디렉토리: 상용 라이선스** (`ee/LICENSE` — "유효한 구독 없이 프로덕션 사용 금지" 문구, Cal.com ee 라이선스 참고). 소스는 공개 레포에 포함(open-book)하되 사용권만 제한.
- 위젯 임베드 스니펫/예제 에이전트(`examples/`): MIT (유저 코드에 섞이는 부분이라 카피레프트 전파 방지).
- CLA 없이 DCO(Developer Certificate of Origin) 채택 — 기여 마찰 최소화.

## 6. 결제 플로우 (M3, ee/billing)

> **⚠️ PG(결제사)는 아직 미정 — TODO(decision).** 국내 PG(정기결제 지원사) / Stripe(해외 확장 시) / 폴리(수동 계좌이체 시작) 등 어느 쪽이든 가능해야 한다.
> 따라서 코드는 특정 PG API를 직접 호출하지 않고 **반드시 아래 `BillingProvider` 인터페이스 뒤에 숨긴다.** M3 착수 전까지 PG를 확정하고, 확정되면 이 문서에 구현 상세를 추가한다.

```ts
// ee/billing/provider.ts — PG 중립 인터페이스. ee 코드는 이것만 호출한다.
export interface BillingProvider {
  /** 카드/결제수단 등록 UI로 보낼 URL 또는 위젯 파라미터 생성 */
  createRegistrationSession(wsId: string, plan: PlanId, returnUrl: string): Promise<{ redirectUrl: string }>;
  /** 등록 완료 콜백 처리 → 재사용 가능한 결제수단 토큰 반환(암호화 저장은 호출측 책임) */
  completeRegistration(callbackParams: Record<string, string>): Promise<{ paymentMethodToken: string }>;
  /** 저장된 토큰으로 청구. idempotencyKey는 sub_id + period로 호출측이 생성 */
  charge(token: string, amountKrw: number, idempotencyKey: string): Promise<{ ok: true; receiptId: string } | { ok: false; reason: string }>;
}
// v1 구현체는 1개만. 첫 구현 전까지는 ManualBillingProvider(어드민이 입금 확인 후 수동 활성화)로 시작해도 됨.
```

- 세금계산서: 사업자등록번호 입력 시 발행 대상으로 표시. **v1은 수동 발행 허용**(월 10팀 규모) — 어드민 화면에 "이번 달 발행 대상 목록"만 있으면 됨. 자동화는 v1.x.

```
[가입/업그레이드]
1. dashboard 설정 > 결제 → 플랜 선택
2. BillingProvider.createRegistrationSession → 결제수단 등록 UI
3. 콜백 → completeRegistration → paymentMethodToken 저장(암호화)
4. subscriptions 레코드 생성 (status=active, current_period_end=+1개월)
5. workspaces.plan 갱신

[매월 결제 배치 (일 1회 cron)]
1. current_period_end가 지난 active 구독 조회
2. 금액 계산: 기본료 + 초과시트 × 9,000
3. BillingProvider.charge(token, amount, sub_id + period)
4. 성공 → invoices 기록, period +1개월 / 실패 → status=past_due, 이메일, 3회(3일) 재시도 후 plan을 starter 유지·기능은 읽기전용 아님(대화 수 한도만 0으로) → 안내
```

- `ee/` 테이블: `subscriptions`, `invoices`, `payment_methods` — 코어 스키마와 분리된 마이그레이션 세트.
- 결제 실패 시에도 **데이터는 절대 잠그지 않는다**(export 항상 가능). 신뢰가 자산.

## 7. 클라우드 단위 경제 (내부 참고용)

- 목표 인프라 원가: 초기 100 워크스페이스까지 서버 1대 + 관리형 Postgres + Redis ≈ 월 $60~100.
- Starter 10팀 = 월 ₩290,000 → 초기부터 인프라비 커버. LLM 원가 0이 구조적 우위.
- 가격 인상 대신 상위 플랜/부가 수익으로 ARPU 상승 전략. 기존 고객 가격은 12개월 고정 약속(채널톡 반사이익 포지셔닝).
