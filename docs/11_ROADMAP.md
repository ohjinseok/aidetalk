# 11_ROADMAP.md — 마일스톤 작업 분해

> 개발 세션은 이 문서의 체크박스 단위로 작업을 받는다(1세션 = 1~2개). 완료 시 체크 + 날짜 기입.
> 각 항목의 「기준」이 완료 판정 조건. 순서 변경 가능, 마일스톤 간 이동은 오너 결정.

## M0 — 검증 & 기반 (2주)
**목표: 만들 가치 확인 + 빈 모노레포가 `pnpm dev`로 도는 상태**

- [ ] 고객 인터뷰 5건 (Persona A) — H1~H5 가설 검증, 결과를 PRD §6에 기록
- [x] 제품명 확정: **AideTalk** (문서 전체 반영 완료, 2026-07-02)
- [ ] 네이밍 선점: `aidetalk` GitHub org·npm 스코프, 도메인(aidetalk.io/.chat + 오타 방어 aidtalk.io), 키프리스 상표 확인 — README §브랜드 표 기준
- [ ] 라이선스 확정 — 기본안(AGPL+ee) 유지 여부. n8n/Cal.com/Chatwoot 구조 비교 메모 남기기
- [x] 모노레포 스캐폴드 — 「기준」 CLAUDE.md 레포 구조 그대로 생성, `pnpm dev`로 3개 앱 빈 화면 기동, `pnpm lint/typecheck/test` 통과 (2026-07-03)
- [x] `packages/shared` v1 — 「기준」 id 유틸(newId), plans.ts, AppError, 에러 코드 상수(04 §7), Agent Protocol zod(05와 1:1), WS 봉투/타입 union(04 §5), adapters 인터페이스(02 §1-1) (2026-07-03)
- [x] CI — 「기준」 lint+typecheck+vitest가 PR에서 돌고 실패 시 머지 차단 (2026-07-03, 머지 차단은 GitHub branch protection 설정 필요 — docs/12 §4)
- [x] docker/compose.yml 초안 — 「기준」 postgres+redis+server(healthz 200)+dashboard 기동 (2026-07-04)

## M1 — 코어 빌드 (7주)
**목표: "위젯에서 보낸 메시지에 내 에이전트가 답하고, 핸드오프하면 인박스에서 사람이 받는다. 상담이 매출로 이어졌는지 보이고, AI가 상담원을 돕는다."**

### W1-2: 메시징 백본
- [ ] DB 스키마 전체(03 문서 §2 그대로) + 마이그레이션 + repos 골격 — 「기준」 pnpm db:migrate 성공, repo 함수 시그니처에 workspaceId 강제(타입 테스트)
- [ ] visitor 세션: POST /v1/widget/session + visitor_token 서명/검증 — 「기준」 04 §1 스키마 일치, 위조 토큰 401 테스트
- [ ] 대화/메시지 API: conversations 생성, messages append/list — 「기준」 planEnforcer(Noop) 훅 위치 존재
- [ ] WS 게이트웨이: /ws/visitor·/ws/agent 인증, 연결 레지스트리, PubSubAdapter(redis+memory) fan-out — 「기준」 04 §5.5 채널 설계 준수
- [ ] 메시지 신뢰성: clientMsgId 중복 제거, ack, after cursor 동기화 — 「기준」 **09 §2 테스트 5종 통과 (필수 커버리지)**

### W3-4: 위젯 (최대 리스크 구간 — 실기기 병행)
- [ ] 로더(≤2KB) + 본체 비동기 로드 + at_l 클릭 보고 — 「기준」 06 §1
- [ ] Shadow DOM UI: Launcher/ChatWindow/MessageList/Composer/QuickReplies/EmailPrompt — 「기준」 06 §2 구성 전부, i18n 키만 사용
- [ ] 전송 파이프라인 + 재연결(백오프/visibilitychange) — 「기준」 06 §4.1-4.2
- [ ] long-poll 폴백 — 「기준」 WS 차단 환경 시뮬레이션에서 대화 성립
- [ ] iOS visualViewport + 모바일 전체화면
- [ ] size-limit CI (50KB/2KB) — 「기준」 초과 시 빌드 실패 확인
- [ ] Playwright E2E 5종(06 §8) — 「기준」 **09 §7 통과 (필수)**

### W5: Agent 커넥터 + 핸드오프
- [ ] agents CRUD + secret 생성/1회 노출/재발급 + 연결 테스트 엔드포인트 — 「기준」 04 §2
- [ ] Agent Dispatcher: HMAC, 타임아웃, 응답 파싱, track_links URL 치환, 실패 처리/auto_disable, agent_logs — 「기준」 **09 §3 테스트 1~5,7 통과 (필수)**
- [ ] 핸드오프 플로우: handoff 응답/손님 요청/자동(실패) 3경로 + returned_to_ai — 「기준」 mode=human 동안 reply dispatch 0건 테스트
- [ ] mode=assist dispatch 골격 (UI는 W7) — 「기준」 09 §3-6 통과
- [ ] examples/agent-node — 「기준」 FAQ reply + handoff + assist 동작, README 첫 줄 Claude Code 안내, __aidetalk_ping__ 처리

### W6: 인박스 (대시보드)
- [ ] auth(가입/로그인/세션) + 온보딩(워크스페이스 생성, segment 선택) + 멤버 초대(inviteUrl)
- [ ] 대화 목록: 필터/무한스크롤/실시간 upsert/검색 — 「기준」 07 §2.1
- [ ] 대화 상세: 스레드+이벤트 병합, 답장(자동 mode 전환), 담당자/종료/AI반환 — 「기준」 07 §2.2, 상담원 2명 동시 처리 충돌 없음(수동 확인)
- [ ] 핸드오프 알림(브라우저 Notification + 하이라이트)
- [ ] AI 로그 화면 + 커넥터 등록 UI(secret 1회 모달) — 「기준」 07 §4
- [ ] 위젯 설정 화면 + 라이브 프리뷰 + 임베드 코드 복사 — 「기준」 07 §5
- [ ] **권한 격리 테스트 — 09 §4 전체 통과 (필수)**

### W7: 전환 트래킹 + 어시스트
- [ ] 링크 태깅/클릭 추적: tracked_links, /t/click, 히스토리 파라미터 제거 — 「기준」 09 §5-1,2 통과
- [ ] 대화 상세 트래킹 표시(클릭 뱃지) + 트래킹 요약 화면(S1만, "추정" 라벨) — 「기준」 07 §3, S2 404 테스트(09 §5-5)
- [ ] 어시스트 파이프라인: assist dispatch → assist_suggestions → suggestion.new(agents 채널) → 사이드 패널 3버튼 + outcome 기록 — 「기준」 07 §2.3
- [ ] **어시스트 권한 격리 재검증 — 09 §4-2 통합 테스트 (필수)**

## M2 — 셀프호스팅 패키징 & 공개 준비 (3주)
**목표: 모르는 사람이 README만 보고 30분 안에 띄운다**
- [ ] compose 원커맨드 검증 (맨 우분투 VM) — 「기준」 10 §2 절차 그대로 30분 내 대화 성립
- [ ] .env.example + env zod 검증 + 부팅 마이그레이션 엔트리포인트
- [ ] 문서 사이트: 설치 가이드 + AGENT_PROTOCOL 공개판 + CSP/임베드 가이드 (한국어 우선, 영어 병행)
- [ ] examples/agent-python
- [ ] 카페24/아임웹 실사이트 임베드 실측 → edge case 수정 + 06 §6 갱신
- [ ] 보안 점검 — 「기준」 08 문서 전 항목 체크 감사
- [ ] 텔레메트리 opt-in (수집 항목 문서 명시)
- [ ] README(스크린샷/데모 GIF/"왜 만들었나") + 이슈 템플릿 + CONTRIBUTING(DCO)

## M3 — 클라우드 알파 & 런칭 (3주)
**목표: 유료 10팀 + 공개 런칭**
- [ ] 클라우드 배포(단일 리전) + EDITION=cloud + 백업/uptime 모니터링 — 「기준」 10 §4
- [ ] ee/plan-limits: usage_counters + CloudPlanEnforcer — 「기준」 **09 §6 통과 (필수)**
- [ ] **TODO(decision): PG 선정** (국내 정기결제 PG vs Stripe vs 수동 시작) — M3 착수 전 확정
- [ ] ee/billing: BillingProvider 구현체 1개 — 결제수단 등록 → 구독 → 월 결제 배치 → 실패 처리 — 「기준」 01 §6 플로우, 테스트 결제 왕복
- [ ] 세금계산서 수동 운영 어드민(발행 대상 목록)
- [ ] 셀프서브 온보딩(가입→워크스페이스→임베드) 마찰 점검
- [ ] 런칭: GeekNews/디스콰이엇/Show HN + 디자인 파트너 10팀 수동 온보딩(인터뷰 5팀 우선)

## v1.x 백로그 (런칭 후 시그널 보고)
- **전환 스크립트(픽셀) → POST /t/conversion 정확 매출** (04 §3 이미 명세됨)
- SSE 스트리밍 응답 / 프로액티브 메시지 API
- 링크 destination + 미니 프로필 + 예약 (S2 흡수, conversions source=booking 재사용)
- 비동기 도달: 웹푸시/SMS/이메일 (손님이 채널 선택, 벤더 비종속 — 알림톡은 선택지 중 하나)
- 파일 업로드(StorageAdapter 활성) / FAQ 간이봇 / Slack 알림 / CSV export
- 어시스트 고도화: 전환된 상담 패턴 → 제안 근거
- 멀티 에이전트 라우팅 / Postgres RLS / OAuth
- 알림톡 발송 마진(부 수익) / 카카오톡 채널 인바운드(v2 별도 PRD) / discovery 레이어(v3+, PRD §9.5)

## AI 생태계 로드맵 (표준 대응 — 원칙: **MCP 하나만 진지하게, 나머지는 관망**)
- v1.5 — SSE 스트리밍 + 메시지 모델을 AG-UI와 호환 방향으로 정렬
- v2 — **AideTalk 자체를 MCP 서버로 노출**: `대화 목록 조회 / 고객 정보 읽기 / 메시지 전송 / 핸드오프 트리거 / 방문자 속성 쓰기` 도구. OAuth 인증 remote MCP + 레지스트리 등록 → "모든 AI 에이전트가 우리 CS를 도구로 사용"
- v2.5 — 연동 Skill을 skill 마켓플레이스에 게시 (배포 = 마케팅, MCP 서버를 dependency로 선언)
- v3 — UCP/AP2(상거래·결제): 관망하다 국내 결제 인프라와 묶일 시점에 진입
- 관망: A2A, A2UI. 공통 주의: MCP 노출 시 인증·권한·rate limit를 설계 단계부터(OWASP Agentic Top 10)
