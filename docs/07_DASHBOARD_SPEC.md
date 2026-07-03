# 07_DASHBOARD_SPEC.md — 상담 인박스/설정 대시보드 명세

> apps/dashboard — Next.js 15 App Router + Tailwind. 전체 UI 한국어 기본(i18n 키), 데스크톱 우선(≥1024px 최적화, 태블릿까지 사용 가능 수준).
> 데이터: REST(04 문서) + `/ws/agent` WebSocket. 상태 관리는 서버 상태 = TanStack Query, WS 이벤트로 쿼리 무효화/직접 캐시 갱신.

## 1. 라우트 맵 (App Router)

```
/login /signup /invites/accept
/(app)/w/[wsId]/inbox                      # 기본 랜딩. 대화 목록 + 상세 2컬럼(+어시스트 3컬럼)
/(app)/w/[wsId]/inbox/[convId]
/(app)/w/[wsId]/tracking                   # 전환 트래킹 요약 (S1 전용 — S2는 라우트 자체 숨김)
/(app)/w/[wsId]/agents                     # 커넥터 목록/등록
/(app)/w/[wsId]/agents/[agentId]/logs      # AI 로그
/(app)/w/[wsId]/settings/widget            # 위젯 설정 + 임베드 코드
/(app)/w/[wsId]/settings/members
/(app)/w/[wsId]/settings/workspace         # 이름, 귀속 규칙, (클라우드) 플랜/결제 → ee 컴포넌트 주입 지점
/onboarding                                # 첫 로그인: 워크스페이스 생성(name, segment 선택)
```
- 레이아웃: 좌측 얇은 내비(인박스/트래킹/커넥터/설정) + 워크스페이스 스위처(상단).
- 인증 가드: 미들웨어에서 세션 없으면 /login. wsId membership은 서버 컴포넌트에서 검증.

## 2. 인박스 (핵심 화면)

### 2.1 대화 목록 (좌 컬럼, 320px)
- 필터 탭: 열림 / 대기 / 종료 (status). 정렬 lastMessageAt desc, 무한 스크롤(cursor).
- 항목: 방문자 이름(없으면 "방문자 " + vis id 뒤 4자), 마지막 메시지 미리보기 1줄, 상대시간, mode 뱃지(🤖 AI / 👤 사람), 담당자 아바타.
- 실시간: `inbox.upsert` 수신 시 항목 upsert + 재정렬. `handoff.new` 수신 시 항목 하이라이트(노란 배경 3초) + 브라우저 Notification(권한 있으면) + 파비콘 뱃지.
- 상단 검색창: q 파라미터로 서버 검색(단순 ILIKE, v1).

### 2.2 대화 상세 (중앙 컬럼)
- 헤더: 방문자 이름/이메일, mode 뱃지, 액션 버튼들 — [담당자 지정 드롭다운] [AI에게 반환](mode=human일 때) [종료/다시 열기]
- 스레드: 메시지 말풍선 + `conversation_events`를 회색 시스템 라인으로 시간순 병합 표시 ("🤖→👤 상담원에게 전환됨 — 사유: 환불 요청").
- 각 agent_ai 메시지에 작은 "로그 보기" 링크 → 해당 agent_log 모달.
- tracked_links가 있는 메시지: 링크 옆에 클릭 여부 뱃지("🔗 클릭됨 14:02" / "미클릭").
- Composer: 전송 시 `POST .../messages`. mode=ai 상태에서 전송하면 확인 없이 자동 mode=human 전환됨을 입력창 위 힌트로 표시.
- 우측 사이드 정보 패널(접이식): 방문자 프로필(email/name/attributes 편집), 시작 페이지, 이 대화의 전환 요약(S1).

### 2.3 어시스트 패널 (우 컬럼, mode=human 대화에서만)
- `suggestion.new` 수신 → 카드 스택 최상단 추가 (draft 전문, rationale 회색 캡션, actions 버튼).
- 카드 버튼: **[그대로 보내기]**(draft를 즉시 전송 + outcome=accepted) / **[편집해서 쓰기]**(Composer에 draft 주입, 전송 시 outcome=edited) / **[무시]**(outcome=ignored, 카드 dim).
- action의 url 버튼 → 클릭 시 그 url을 링크로 담은 메시지를 Composer에 주입.
- 손님 메시지가 새로 오면 이전 pending 카드는 자동 dim(수동 outcome 없으면 ignored로 남김 처리 안 함 — pending 유지, 집계에서 pending 제외).
- 패널 헤더에 최근 30일 채택률 미니 지표 (`accepted+edited / 전체`).

## 3. 전환 트래킹 화면 (S1 전용)
- 기간 선택(이번 달 기본) → summary API.
- 카드 4개: 총 대화 / 링크 안내 대화 / 클릭 발생 대화 / **상담 기여 매출(추정)** — 이 라벨 문구 고정(CLAUDE.md 규칙 10), 옆에 ⓘ 툴팁 "클릭·전환 데이터 기반 추정치이며 인과를 확정하지 않습니다".
- source별 구성(click_only/pixel) 표시. v1은 pixel 미구현이므로 "전환 스크립트 설치하면 정확도 상승" 안내 배너 + v1.5 문서 링크.

## 4. 커넥터 화면
- 등록 폼: name / endpointUrl / timeoutMs(고급, 기본 30000) / assistEnabled 토글.
- 등록 완료 모달: **secret 1회 표시 + 복사 버튼 + "다시 볼 수 없음" 경고.** 서명 검증 예제 코드(Node/Python 탭) 동봉.
- 목록 카드: status 뱃지(active/disabled/auto_disabled — auto는 빨간색 + "연속 실패로 비활성화됨, 로그 확인" 링크), [연결 테스트] 버튼(결과 latency 표시), [secret 재발급], [활성/비활성].
- AI 로그 화면: 테이블(시각/mode/outcome/latency/미리보기), outcome 필터, 행 클릭 → 요청/응답 요약 JSON 뷰어.

## 5. 설정 화면
- 위젯 설정: primaryColor 피커, greeting, tone(formal/casual), launcherPosition, officeHours 에디터(요일별 시간), offHoursMessage. 우측에 **위젯 라이브 프리뷰**(iframe로 위젯 데모 페이지 로드). 하단 임베드 코드 블록 + 복사.
- 멤버: 목록(역할/상태), 이메일 초대(→ inviteUrl 복사. 이메일 발송은 클라우드만, 셀프호스팅은 URL 복사 방식), 역할 변경/제거는 owner만.
- 워크스페이스: 이름, attributionRule(라스트클릭/퍼스트클릭), 위험 구역(대화 전체 CSV export — Could, hard delete).
- (클라우드) 결제 탭: `EDITION=cloud`일 때만 렌더 — ee의 `<BillingPanel/>`을 dynamic import. 코어 코드는 존재 여부만 확인(규칙 8).

## 6. 공통 컴포넌트/규칙
- Toast(성공/에러), ConfirmDialog(파괴적 액션), EmptyState(각 목록 첫 화면 — 인박스 EmptyState에는 임베드 가이드 링크).
- 에러 표시: AppError code → i18n 키 매핑 테이블 `packages/i18n/ko/errors.json`.
- 날짜: 오늘은 "HH:mm", 그 외 "M월 d일". 라이브러리 없이 Intl API만(번들 절약 습관 공유).
- 접근성 최소선: 모든 버튼 aria-label, 키보드로 인박스 목록 이동(↑↓ Enter).
