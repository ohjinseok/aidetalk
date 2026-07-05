# ee/ — Enterprise Edition (클라우드 전용, 상용 라이선스)

이 디렉토리는 AideTalk 클라우드 전용 코드(billing, plan-limits, backup 등)를 담는다.

## 규칙 (CLAUDE.md 절대 규칙 7, 8)

- `ee/` 밖의 코어 코드는 **절대** `ee/`를 import하지 않는다. 코어는 `ee/` 없이 빌드·구동 가능해야 한다.
- 코어와의 연결 지점은 인터페이스 주입(`PlanEnforcer`, `BillingProvider` 등)만 허용한다.
- 클라우드 전용 런타임/인프라에 의존하는 코드는 전부 이 아래에 둔다.

## 현재 상태

클라우드 전용 기능(빌링, 플랜 제한, 백업)이 이 디렉토리에 들어갈 예정이며 아직 구현 전이다.
