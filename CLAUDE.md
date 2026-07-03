# CLAUDE.md

이 파일은 이 레포에서 작업하는 AI(Claude Code)가 **매 세션 반드시 따라야 하는 규칙**이다.
판단이 필요한 상황에서 이 파일 > PRD > 각 명세 문서 순으로 우선한다.

## 프로젝트 개요

**AideTalk** — 한국 SMB를 위한 오픈소스 CS 메신저.
유저가 직접 만든 AI Agent를 HTTP 커넥터로 연결하는 채팅 위젯 + 상담 인박스.
차별 기능: **매출 전환 트래킹**(상담→구매 측정, 사이트 있는 S1 전용)과 **실시간 상담 어시스트**(AI가 상담원을 코칭).
수익 모델: Open Core — 셀프호스팅 무료(AGPL), 클라우드 유료. `docs/01_BUSINESS_MODEL.md`.

문서 맵: `docs/00_PRD.md`(요구사항) / `02_ARCHITECTURE`(설계) / `03_DATA_MODEL`(스키마) / `04_API_SPEC`(REST·WS 명세) / `05_AGENT_PROTOCOL`(커넥터 계약) / `06_WIDGET_SPEC` / `07_DASHBOARD_SPEC` / `08_SECURITY` / `09_TESTING` / `10_DEPLOYMENT` / `11_ROADMAP`(작업 단위)

## 절대 규칙 (위반 금지)

1. **LLM 호출 코드를 코어에 넣지 않는다.** AI는 유저의 외부 endpoint가 처리. 우리는 릴레이만. (예외: `examples/` 하위 예제)
2. **PRD의 Non-goals를 구현하지 않는다.** 카카오/네이버 채널 연동, 마케팅 발송, 전화 기능은 PRD 변경 없이는 거부하고 이유를 설명.
3. **위젯 번들 예산 50KB gzipped.** 위젯에 의존성 추가 시 크기 영향을 먼저 보고. 위젯에서 React 금지, Preact까지만.
4. **모든 사용자 노출 문자열은 i18n 키로.** 하드코딩 금지. 기본 로케일 `ko`, 파일은 `packages/i18n/`.
5. **시크릿/키를 코드·로그에 남기지 않는다.** Agent shared secret은 해시 비교만, 로그에는 마스킹 (`sk_live_ab****`).
6. **마이그레이션 없는 스키마 변경 금지.** `pnpm db:generate`로 마이그레이션 생성 후 같은 커밋에 포함.
7. **코어를 특정 벤더 전용 런타임에 묶지 않는다.** 코어는 일반 Node에서 돈다. 인프라 추상화는 DB·파일저장·실시간전파 3곳만 (ARCHITECTURE §1-1). 클라우드 전용 코드는 전부 `ee/` 하위에.
8. **`ee/` 밖의 코드는 `ee/`를 import하지 않는다.** 코어는 `ee/` 없이 빌드·구동 가능해야 한다. 연결 지점은 인터페이스 주입(`PlanEnforcer`, `BillingProvider`)만 허용 — 01 문서 §4.
9. **상담 어시스트 제안은 상담원 전용.** `assist_suggestions`는 visitor 세션/토큰으로 절대 조회 불가. mode=assist 응답은 손님에게 전송하지 않는다.
10. **전환 트래킹은 "기여 추정"이지 "인과 확정"이 아니다.** UI 문구는 항상 "상담 기여 매출(추정)". S1 전용 — S2 워크스페이스에 노출 금지.
11. **모든 repo 함수는 `workspaceId`를 첫 번째 필수 인자로 받는다.** 멀티테넌트 격리를 타입으로 강제.

## 기술 스택 (변경하려면 ARCHITECTURE.md 먼저 수정)

- 모노레포: pnpm workspaces + Turborepo / TypeScript strict / Node 22
- 서버: Hono(HTTP) + ws(WebSocket), 단일 Node 프로세스
- DB: PostgreSQL 16 + Drizzle ORM
- 실시간 전파: `PubSubAdapter` (기본 Redis, in-memory 옵션)
- 파일: `StorageAdapter` (기본 로컬 디스크, S3/R2 옵션)
- 대시보드: Next.js 15 App Router + Tailwind
- 위젯: Preact + vanilla CSS(Shadow DOM 내부) + Vite
- 테스트: Vitest / Playwright(위젯 E2E)
- 배포: Docker Compose (셀프호스팅 = 클라우드 동일 이미지)

## 레포 구조

```
apps/
  server/          # Hono API + WS 게이트웨이 + Agent Dispatcher
  dashboard/       # Next.js 상담 인박스 + 설정
  widget/          # 임베드 위젯 (Preact)
packages/
  db/              # Drizzle 스키마 + 마이그레이션 + repos
  shared/          # zod 스키마, 공유 타입 (API 계약 단일 출처)
  i18n/            # 로케일 파일 (ko 기본, en)
ee/                # 클라우드 전용 (상용 라이선스): billing, plan-limits, backup
examples/
  agent-node/      # Claude API 예제 에이전트 (Node/Hono)
  agent-python/    # 〃 (Python/FastAPI)
docs/              # 본 문서 세트
docker/            # compose, Dockerfile
```

## 명령어

```bash
pnpm install
pnpm dev                  # server:4000, dashboard:3000, widget:5173
pnpm test                 # Vitest
pnpm test:e2e             # Playwright
pnpm db:generate          # 마이그레이션 생성
pnpm db:migrate
pnpm lint && pnpm typecheck
docker compose -f docker/compose.yml up -d
```

## 코딩 컨벤션

- API 계약은 `packages/shared`의 zod 스키마가 단일 출처. 서버/위젯/대시보드 전부 여기서 import. 스키마 없는 임의 JSON 금지.
- 에러는 `AppError(code, httpStatus, message)`로 통일. code는 `04_API_SPEC.md` §7 표만 사용.
- DB 접근은 `packages/db/src/repos/`의 repository 함수로만. 라우트 핸들러 직접 쿼리 금지.
- WS 메시지는 `{ type, payload }` 봉투. type은 shared의 union에 등록 (04 문서 §5).
- ID는 전부 `prefix_nanoid` 텍스트 (`ws_`, `conv_`, `msg_` ...). serial 금지.
- 커밋: Conventional Commits. 한 커밋 = 한 논리 변경.
- 주석/문서 한국어, 식별자 영어.

## 작업 방식

- 새 기능 착수 전: PRD 수용 기준 확인 → 계획 짧게 제시 → 구현.
- 구현 순서: zod 스키마/타입 → DB(repo) → 서버 라우트 → 클라이언트.
- 테스트 필수 영역(09 문서): 메시징 신뢰성(순서/재연결/중복), 권한 격리(assist·워크스페이스), plan 제한, HMAC 검증. 이 영역은 테스트 없이 완료 처리 금지.
- 모르는 외부 동작(카페24 임베드 환경 등)은 추측 구현 금지 → `TODO(question):` 주석 + 질문.

## 현재 마일스톤

> 마일스톤 전환 시 이 섹션만 갱신한다.

**M0 — 검증 & 기반** (`docs/11_ROADMAP.md`)
우선순위: 모노레포 스캐폴드 > shared zod 스키마 > CI > docker compose 초안
