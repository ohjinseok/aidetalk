# 08_SECURITY.md — 보안 요구사항

> 해당 영역 구현 시 이 체크리스트를 수용 기준으로 삼는다. M2 "보안 점검" 항목은 이 문서 전체를 감사하는 작업이다.

## 1. 시크릿 취급
- Agent shared secret: 생성 시 `adt_` + 32바이트 random. 원문은 생성/재발급 응답 1회. DB에는 sha256 해시(비교용) + AES-256-GCM 암호문(`secret_enc`) — 우리가 아웃바운드 HMAC 서명 주체라 원문 재현이 필요하므로, 서명 시에만 복호화한다(복호화 결과 로그/응답 노출 금지).
- 웹훅 shared secret도 동일 패턴: `whsec_` + 32바이트 random, sha256 해시 + `secret_enc`(§7).
- **암호화 전용 키(`SECRET_ENC_KEY`)** — agent/웹훅 secret의 AES-256-GCM 암호화는 `SECRET_ENC_KEY`(32바이트, hex 또는 base64)로 파생한 키를 사용한다(Stripe/Slack식으로 세션 키 로테이션과 분리). **미설정 시 `SESSION_SECRET` 파생으로 폴백** — 셀프호스팅 30분 셋업을 깨지 않기 위함이며, 이 경우 부팅 시 "SECRET_ENC_KEY 설정 권장 — 세션 키 로테이션과 분리" 경고 로그를 남긴다(`apps/server/src/lib/secret-enc-key.ts`).
- 비교는 항상 timing-safe.
- 로그 마스킹: pino redact 설정으로 `secret`, `password`, `authorization`, `cookie` 경로 자동 마스킹. secret류 출력 필요 시 `adt_ab****` / `whsec_ab****` 형식.
- 서버 시크릿(`VISITOR_TOKEN_SECRET`, `SESSION_SECRET`, `SECRET_ENC_KEY` 등)은 환경변수로만. 코드/레포에 절대 커밋 금지 — `.env.example`에는 placeholder만.

## 2. Agent Dispatcher (아웃바운드)
- 모든 요청 HMAC-SHA256(`timestamp.body`) + timestamp ±5분 검증 규약(에이전트 측 문서화).
- endpoint URL: 클라우드(EDITION=cloud)에서 https 강제 + **SSRF 가드** — 등록 시와 dispatch 시(DNS 리바인딩 대비) 모두 resolve된 IP가 사설/루프백/링크로컬 대역(10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7)이면 거부. 셀프호스팅은 `ALLOW_INSECURE_AGENT_ENDPOINT=true`로 완화 가능.
- 응답 본문 64KB 제한(초과 시 에러 처리), redirect 미추적, Content-Type 검증.
- 연속 실패 5회 → auto_disabled + 구독한 웹훅에 `agent.auto_disabled` 발송(§7) + 대시보드 배너(공통). owner 이메일은 v1에서 웹훅+배너로 대체하며, 이메일 발송은 M3 클라우드에서 검토한다.

## 3. 인바운드 인증/권한
- visitor_token: HMAC 서명 검증. 위조 토큰 → 401. 토큰의 ws와 요청 workspace 불일치 → 403.
- **권한 경계 3대 불변식 (테스트 필수, 09 문서):**
  1. visitor 자격으로 상담원 자원(인박스 API, assist_suggestions, agent 설정) 접근 불가 — 전부 403/404.
  2. member라도 소속 아닌 workspace 자원 접근 불가 — 403.
  3. `suggestion.new` WS 이벤트는 agent 소켓에만 fan-out (`conv:{id}:agents` 채널 분리).
- 대시보드 세션: httpOnly + SameSite=Lax(+prod Secure). CSRF: 상태 변경 요청은 `Origin` 헤더 화이트리스트 검증(쿠키 인증 경로 한정).
- 비밀번호: argon2id (memory 19MiB, iterations 3, parallelism 1 — OWASP 권장 하한), 최소 8자. 구현: `packages/db/src/crypto.ts` `hashPassword`, 스키마: `apps/server/src/http/schemas.ts`(signup `password.min(8)`).

## 4. 입력 검증 / 출력 안전
- 모든 요청 body는 zod parse 후 사용. 실패 → 400 validation/failed.
- 메시지 text 4000자 제한. 렌더링은 위젯/대시보드 모두 **텍스트 노드로만** (innerHTML 금지). URL 자동 링크화는 정규식 추출 후 `<a href>` 생성 — `javascript:` 스킴 차단, `rel="noopener noreferrer nofollow"`.
- quick_replies/attributes 등 유저·에이전트 유래 값도 동일 원칙.

## 5. 레이트리밋 / 남용 방지
- 04 문서 §0.2 표 적용 (Redis `INCR`+`EXPIRE` 고정 윈도).
- WS: 연결당 인바운드 30 msg/10s 초과 시 error 이벤트 후 초과분 drop. 동일 visitor 동시 연결 5개 제한.
- 워크스페이스별 dispatch 동시성 상한 10 (에이전트 서버 보호 + 우리 자원 보호).

## 6. 전송/저장
- 클라우드: TLS 종단(리버스 프록시), HSTS. 셀프호스팅 문서에 리버스 프록시(Caddy 예시) 가이드.
- PII(visitors.email/name/phone): v1은 평문 저장(검색 필요) — 접근은 repo 계층 경유만. 파기 요청은
  `visitorRepo.hardDeletePii`(익명화)로 대응한다 — 이름과 달리 **행 삭제가 아니다**: FK 연쇄 삭제로
  conversations/messages가 함께 사라지면 상담 기록 감사가 불가능해지므로, 대화 구조는 보존하고
  visitor의 email/name/phone/attributes만 null/{}로 지우고 해당 visitor가 작성한 메시지 content를
  `server.messageRedacted` i18n 상수로 치환한다. 이메일 병합(`mergedInto`) 클러스터 전체를 함께
  처리한다. tracked_links/conversions/assist_suggestions/conversation_events는 visitorId를 참조로만
  가지므로(PII 값 자체가 아님) 구조 보존을 위해 그대로 둔다. **트리거(오너 결정 완료):** 대시보드
  방문자 정보 패널 하단 위험 구역에 **owner 전용** "개인정보 삭제" 버튼을 노출한다. 2단계 확인
  (버튼 → "되돌릴 수 없음/대화 기록은 남음" 경고 ConfirmDialog)을 거치고, `DELETE
  /v1/workspaces/:wsId/visitors/:visitorId/pii`(owner 검증 + 감사 로그)로 처리한다. 비owner·타
  워크스페이스는 403/404. 개인정보처리방침 문서에 수집 항목 명시(M2).
- 백업(클라우드, ee): pg_dump 일 1회 + 오브젝트 스토리지 암호화 보관 30일.

## 7. 웹훅(아웃바운드)도 Agent와 동일 규약
- HMAC 서명(timestamp.body, `X-AideTalk-Timestamp`/`X-AideTalk-Signature`), https 강제(클라우드), SSRF 가드 공유 유틸 사용(`lib/agent-endpoint.ts`), 응답 무시(fire-and-forget). 타임아웃 10초, 실패 시 재시도 3회(1분/5분/30분).
- 이벤트 카탈로그(04 §2): `agent.auto_disabled` { agentId, agentName, failureCount }, `conversation.handoff` { conversationId, reason }. 워크스페이스가 구독(events)한 이벤트에만 발송.
- ⚠️ v1 한계: 재시도는 in-process `setTimeout`으로 예약한다 — 서버 재시작 시 예약된 재시도는 유실된다(내구성 있는 큐는 후속 웨이브).

## 8. 의존성/공급망
- pnpm lockfile 커밋 필수, CI에서 `pnpm audit --prod --audit-level high` (high 이상 실패). `.github/workflows/ci.yml`.
- Dockerfile: non-root 유저(`USER node`), 멀티스테이지, `node:22-alpine`.
  - 베이스 이미지는 `node:22-alpine`을 쓴다(문서 초안의 `node:22-slim`에서 확정). 근거: 이미지 크기·공격 표면이 더 작고, healthcheck가 busybox `wget`으로 외부 패키지 추가 없이 동작한다. server/dashboard 두 Dockerfile 모두 동일 베이스를 쓴다(`docker/server.Dockerfile`, `docker/dashboard.Dockerfile`).
