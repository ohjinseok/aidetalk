# 04_API_SPEC.md — REST + WebSocket 전체 명세

> 서버(apps/server)가 노출하는 모든 인터페이스. 단일 출처는 `packages/shared`의 zod 스키마이며, 이 문서와 스키마는 항상 동기화한다.
> 규칙: 여기 없는 엔드포인트/WS 타입을 임의로 추가하지 말 것. 필요하면 이 문서에 먼저 추가.

## 0. 공통

- Base URL: 셀프호스팅 `{SERVER_URL}` (예 `http://localhost:4000`)
- 모든 요청/응답 `application/json; charset=utf-8`
- 성공: `2xx` + 리소스 객체. 리스트는 `{ items: [...], nextCursor: string | null }` (cursor = 마지막 항목의 정렬키 인코딩, base64)
- 실패: §7 에러 봉투 `{ error: { code, message } }`
- 시간은 전부 ISO 8601 UTC 문자열
- 네이밍: JSON 필드는 camelCase (에이전트 프로토콜(05 문서)만 예외적으로 snake_case — 외부 공개 계약이라 언어 중립 표기)

### 0.1 인증 체계 3종
| 자격 | 대상 | 전달 방식 | 발급 |
|---|---|---|---|
| `visitor_token` | 위젯(방문자) | `Authorization: Bearer vt.{payload}.{sig}` 또는 WS 쿼리스트링 | `POST /v1/widget/session` |
| 세션 쿠키 | 대시보드(상담원) | httpOnly cookie `od_session` | `POST /v1/auth/login` |
| (없음) | 트래킹 픽셀 `/t/*` | token 자체가 자격 | - |

`visitor_token` 형식: `vt.{base64url(json{vis, ws, iat})}.{hmac_sha256(payload, VISITOR_TOKEN_SECRET)}`. 서버는 서명만 검증(무상태). 만료 없음(v1) — 방문자 연속성이 우선.

### 0.2 레이트리밋 (Redis 고정 윈도)
| 대상 | 한도 | 초과 시 |
|---|---|---|
| visitor 메시지 전송 | 10 msg/min/visitor | `429 rate/limited` |
| `POST /v1/widget/session` | 30/min/IP | 〃 |
| 로그인 시도 | 10/min/IP | 〃 |
| `/t/*` | 60/min/IP | 204 무시(응답은 항상 성공처럼) |

## 1. 위젯 API (`/v1/widget/*`) — visitor_token 인증

### POST /v1/widget/session — 세션 발급/복원 (인증 불필요)
```jsonc
// req
{ "workspaceId": "ws_...", "existingToken": "vt...", // 있으면 검증 후 재사용
  "pageUrl": "https://shop.com/p/1", "referrer": "https://instagram.com/..." }
// res 200
{ "visitorToken": "vt...", "visitor": { "id": "vis_...", "email": null, "name": null },
  "workspaceName": "우리가게",   // 위젯 헤더 표기용
  "widgetSettings": { /* workspaces.widgetSettings + officeHours 평가 결과 isOfficeHours: bool */ },
  "openConversationId": "conv_..." | null }  // 이 visitor의 가장 최근 open 대화
```
- existingToken 유효 → 동일 visitor. 무효/없음 → visitor 신규 생성(firstReferrer/firstPageUrl 기록).

### POST /v1/widget/conversations — 대화 시작
```jsonc
// req
{ "pageUrl": "..." }
// res 201
{ "conversation": { "id": "conv_...", "mode": "ai" | "human", "status": "open" } }
```
- 서버 내부: `planEnforcer.assertCanCreateConversation(ws)` → 초과 시 `402 plan/limit_exceeded`.
- mode 초기값: active agent 있으면 `ai`, 없으면 `human`.
- 시작 시 widgetSettings.greeting을 role=system 메시지로 자동 삽입(있을 때). 운영시간 외이면 offHoursMessage도.

### GET /v1/widget/conversations/:id/messages?after={cursor}&limit=50
`{ items: Message[], nextCursor }` — Message 형태는 §6. 재연결 시 누락분 동기화에 사용.

### PATCH /v1/widget/profile — 프로필 점진 수집
```jsonc
{ "email": "kim@example.com", "name": "김손님" }  // 각 필드 optional
```
- email 제공 시 같은 workspace의 동일 email visitor와 병합(mergedInto) 후 새 토큰 반환: `{ visitorToken, visitor }`.

### POST /v1/widget/handoff — 손님이 "상담원 연결" 버튼
`{ conversationId }` → mode=human 전환 + `handoff_requested` 이벤트. res `{ ok: true }`.

- 메시지 **전송**은 REST가 아니라 WS(§5)가 기본. long-poll 폴백 모드에서만 `POST /v1/widget/conversations/:id/messages` (body `{ clientMsgId, text }`, WS message.send와 동일 처리) + `GET .../messages?after=` 폴링(2초 간격) 사용.

## 2. 대시보드 API (`/v1/*`) — 세션 쿠키 인증

### 인증/계정
```
POST /v1/auth/signup        { email, password, name } → 201 { user } + Set-Cookie
POST /v1/auth/login         { email, password } → 200 { user } + Set-Cookie
POST /v1/auth/logout        → 204
GET  /v1/me                 → { user, memberships: [{ workspaceId, workspaceName, role }] }
```
- password: argon2id. 세션: Redis 저장(`sess:{id}` → userId, TTL 14일), 쿠키 httpOnly+SameSite=Lax(+클라우드 Secure).

### 워크스페이스/멤버
```
POST  /v1/workspaces                      { name, segment } → 201 { workspace } (생성자=owner)
GET   /v1/workspaces/:wsId               → { workspace }
PATCH /v1/workspaces/:wsId/settings      { widgetSettings?, attributionRule?, name? } → { workspace }  // owner만
POST  /v1/workspaces/:wsId/members       { email, role } → 201 { member?, invite?, inviteUrl }  // owner만, planEnforcer.assertCanAddSeat(초대 시점)
POST  /v1/invites/accept                  { inviteToken } → { member }  // 로그인 상태에서
GET   /v1/workspaces/:wsId/members       → { items }
DELETE /v1/workspaces/:wsId/members/:id  → 204  // owner만
DELETE /v1/workspaces/:wsId/visitors/:visitorId/pii → { visitorIds, redactedConversationIds }  // owner만, PII 파기(익명화)
```
- 이후 모든 `/v1/workspaces/:wsId/...`는 미들웨어에서 membership 검증 → 아니면 `403 auth/forbidden`.
- **DELETE /visitors/:visitorId/pii(owner만)** — 개인정보보호법 파기 의무 대응. `visitorRepo.hardDeletePii` 호출(08 §6): 이름과 달리 행 삭제가 아니라 **익명화**다. 대화/메시지 구조는 보존하고 visitor의 email/name/phone/attributes만 지우고 방문자 메시지 본문을 치환한다. 이메일 병합(`mergedInto`) 클러스터 전체를 함께 처리. **되돌릴 수 없다.** 방문자 없음/타 워크스페이스면 `404 not_found`. owner 아니면 `403 auth/forbidden`.
- **POST /members 분기(owner만, planEnforcer.assertCanAddSeat는 초대 행 생성 전에):**
  - 기가입 이메일 → 기존 members 초대 흐름 유지: `member(status=invited)` 생성 + `inviteUrl` 반환. res `{ member, inviteUrl }`.
  - 미가입 이메일 → `invites` 행 생성(토큰은 sha256만 저장, raw는 inviteUrl 1회 노출). res `{ member: null, invite, inviteUrl }`.
  - 두 경우 모두 `inviteUrl = {DASHBOARD_URL}/invites/accept?token={raw}`.
- **POST /invites/accept(로그인 상태)** — 토큰으로 두 종류 초대를 모두 수락:
  - `invites` 행(미가입 이메일 초대): token_hash 조회 → 만료(7일)/재수락 거부 + 로그인 사용자 이메일 == invite.email 검증 → markAccepted(원자적) 후 members 행 생성.
  - `members` 행(기가입 계정 초대): inviteToken(raw) 조회 → 대상 계정 일치 검증 → status=active.
  - 실패: 만료/무효 `404 not_found`, 이미 수락/이미 멤버 `409 conflict`, 대상 불일치 `403 auth/forbidden`.
  - 대시보드 흐름: 미로그인으로 초대 링크 접속 시 `/invites/accept`가 가입/로그인으로 유도(토큰 유지). 가입/로그인 직후 자동 수락 → 해당 워크스페이스로 이동.

### Agent 커넥터
```
POST  /v1/workspaces/:wsId/agents         { name, endpointUrl, timeoutMs? }
  → 201 { agent, secret: "adt_..." }   // ⚠️ secret 원문은 이 응답 1회만. 이후 조회 불가
PATCH /v1/workspaces/:wsId/agents/:id     { name?, endpointUrl?, timeoutMs?, assistEnabled?, status?("active"|"disabled") }
POST  /v1/workspaces/:wsId/agents/:id/rotate-secret → { secret }  // 새 secret 1회 노출
POST  /v1/workspaces/:wsId/agents/:id/test → { ok, latencyMs, response? , error? }
  // 서버가 테스트 페이로드(mode=reply, text="__aidetalk_ping__")로 실제 dispatch해 계약 검증
GET   /v1/workspaces/:wsId/agents         → { items }
GET   /v1/workspaces/:wsId/agent-logs?agentId=&cursor= → { items, nextCursor }
```
- endpointUrl 검증: 클라우드(EDITION=cloud)면 https 필수 + 사설 IP 차단. active 전환 시 기존 active agent는 자동 disabled(1개 제약).

### 인박스
```
GET   /v1/workspaces/:wsId/conversations?status=open&cursor=&q=
  → { items: [{ conversation, visitor, lastMessage, unread? }], nextCursor }   // lastMessageAt desc. q는 messages.content ILIKE 단순 검색(v1)
GET   /v1/workspaces/:wsId/conversations/:id
  → { conversation, visitor, events: Event[] }
GET   /v1/workspaces/:wsId/conversations/:id/messages?after=&limit=
POST  /v1/workspaces/:wsId/conversations/:id/messages   { text } → 201 { message }  // role=agent_human, authorId=현재 user
POST  /v1/workspaces/:wsId/conversations/:id/assign     { userId | null } → { conversation }
POST  /v1/workspaces/:wsId/conversations/:id/return-to-ai → { conversation }  // mode=ai, returned_to_ai 이벤트
POST  /v1/workspaces/:wsId/conversations/:id/close      → { conversation }
POST  /v1/workspaces/:wsId/conversations/:id/reopen     → { conversation }
```
- 상담원 메시지 전송 시 mode가 ai였다면 자동으로 mode=human + assigned(본인) 처리(이벤트 기록) — "사람이 끼어들면 AI는 물러난다".

### 전환 트래킹 (S1 전용 — segment=s2_no_site면 전부 404)
```
GET /v1/workspaces/:wsId/conversations/:id/tracking
  → { trackedLinks: [{ id, targetUrl, clickedAt, messageId }], conversions: [{ id, source, amount, occurredAt }] }
GET /v1/workspaces/:wsId/tracking/summary?from=&to=
  → { conversationCount, linkedConversations, clickedConversations,
      attributedRevenueKrw,   // ⚠️ UI 라벨은 항상 "상담 기여 매출(추정)"
      bySource: { click_only: n, pixel: n } }
```

### 상담 어시스트 (상담원 전용)
```
GET   /v1/workspaces/:wsId/conversations/:id/suggestions?after=
PATCH /v1/workspaces/:wsId/suggestions/:id   { outcome: "accepted"|"edited"|"ignored" } → { suggestion }
```
- **visitor_token으로 이 경로 접근 시 무조건 403.** (라우팅상 /v1/widget 밖이라 원천 차단되지만, 테스트로 재확인 — 09 필수)

### 웹훅 (Should)
```
POST   /v1/workspaces/:wsId/webhooks         { url, events } → 201 { webhook, secret(1회) }
GET    /v1/workspaces/:wsId/webhooks         → { items }
DELETE /v1/workspaces/:wsId/webhooks/:id     → 204
```
- `events`는 아래 이벤트 카탈로그 이름만 허용(zod enum). secret은 agents와 동일 패턴 — 원문은 등록 응답 1회만, DB에는 sha256 해시 + AES-GCM 암호문(`secret_enc`)만 저장.
- endpointUrl 검증/SSRF 가드는 agent endpoint와 동일 공유 유틸(08 §2/§7) — 클라우드는 https 강제 + 사설 IP 차단.

**발송**: `POST url` body `{ event, data, occurredAt }` + `X-AideTalk-Timestamp`/`X-AideTalk-Signature`(에이전트와 동일 HMAC-SHA256(timestamp.body) 방식). 타임아웃 10초, 응답 본문은 읽지 않는다(fire-and-forget, status<300만 성공 판정). 실패 시 재시도 3회(1분/5분/30분 지연) — ⚠️ v1은 in-process `setTimeout` 예약이라 서버 재시작 시 예약된 재시도는 유실된다.

**이벤트 카탈로그**:
| event | data | 발생 시점 |
|---|---|---|
| `agent.auto_disabled` | `{ agentId, agentName, failureCount }` | 커넥터 연속 실패 5회로 status=auto_disabled 전환 시(dispatcher의 auto_disable 경로) |
| `conversation.handoff` | `{ conversationId, reason }` | 대화가 사람에게 넘어갈 때(에이전트 handoff 응답/손님 요청/실패 자동 핸드오프 3경로 공통, services/handoff.ts) |

워크스페이스가 구독(`events`에 포함)하지 않은 이벤트는 발송되지 않는다.

## 3. 트래킹 엔드포인트 (`/t/*`) — 무인증, CORS `*`

```
POST /t/click        { token }                  → 204   // tracked_links.clicked_at 기록(최초 1회만)
POST /t/conversion   { workspaceId, externalRef, amount, currency?, occurredAt?, visitorToken? } → 204
  // v1.5. visitorToken(localStorage) 또는 od_visitor 쿠키로 방문자 식별
  // 귀속: 해당 visitor의 최근 30일 내 clicked tracked_link 중 attributionRule 적용해 conversation 결정
  // externalRef 중복 → 204 (멱등, 클라이언트엔 항상 성공)
```
- `/t/*`는 절대 4xx/5xx로 손님 페이지에 영향 주지 않는다 — 실패도 204.

## 4. 임베드/정적
```
GET /widget.js            → 로더 (2KB, Cache-Control: max-age=300)
GET /widget/v{n}/app.js   → 본체 번들 (immutable, max-age=1년)
GET /healthz              → 200 { ok, version }
```

## 5. WebSocket 프로토콜

- 접속: `GET /ws/visitor?token={visitor_token}` / `GET /ws/agent` (쿠키 인증) — 업그레이드 시 인증 실패면 4401 close.
- 봉투: `{ "type": string, "payload": object }`. 알 수 없는 type은 무시(전방 호환).
- ping/pong: 서버가 30초마다 ping, 2회 무응답 시 연결 종료.

### 5.1 위젯 → 서버
| type | payload | 설명 |
|---|---|---|
| `message.send` | `{ conversationId, clientMsgId, text }` | text 1~4000자. 중복 clientMsgId면 기존 메시지로 ack. 이 대화의 `conv:{id}:all` 자동 구독 |
| `conversation.subscribe` | `{ conversationId }` | 손님 소켓을 `conv:{id}:all`에 명시 구독(상대 메시지 실시간 수신). 기존 대화 복원/REST 우선 전송 시 누락 방지. `conv:{id}:agents`는 절대 구독 안 함(규칙 9) |
| `typing.set` | `{ conversationId, isTyping }` | 손님 타이핑 상태 (상담원 화면 표시용) |
| `read.mark` | `{ conversationId, lastMessageId }` | 읽음 처리. 저장 후 상담원에게 read.update(by="visitor") 브로드캐스트 |

### 5.2 서버 → 위젯
| type | payload |
|---|---|
| `message.ack` | `{ clientMsgId, message }` — 저장 확정. 위젯은 임시 말풍선을 확정으로 치환 |
| `message.new` | `{ message }` — 상대(AI/상담원/시스템) 메시지 |
| `typing.start` / `typing.stop` | `{ conversationId, by: "ai" \| "human" }` — ⚠️ 손님 타이핑(by="visitor")은 위젯에 되돌려보내지 않음 |
| `conversation.updated` | `{ conversation }` — mode/status 변경 시 |
| `read.update` | `{ conversationId, by: "visitor"\|"agent", lastMessageId }` — 상대 읽음 통지. 위젯은 by="agent"로 내 마지막 메시지에 "읽음" 표시 |
| `error` | `{ code, message, ref? }` — 예: rate/limited |

### 5.3 대시보드 → 서버
| type | payload |
|---|---|
| `subscribe.workspace` | `{ workspaceId }` — 인박스 목록 실시간용. membership 검증 |
| `subscribe.conversation` / `unsubscribe.conversation` | `{ conversationId }` |
| `typing.set` | `{ conversationId, isTyping }` — 상담원 타이핑(by="human"으로 손님에게 전달) |
| `read.mark` | `{ conversationId, lastMessageId }` — 상담원 열람/포커스 시 읽음 처리. 저장 후 손님에게 read.update(by="agent") 브로드캐스트 |

### 5.4 서버 → 대시보드
| type | payload |
|---|---|
| `inbox.upsert` | `{ conversationSummary }` — 목록 갱신(새 대화/새 메시지/상태 변경) |
| `message.new` | `{ message }` — 구독 중 대화 |
| `conversation.updated` | `{ conversation }` |
| `typing.start` / `typing.stop` | `{ conversationId, by: "visitor"\|"ai"\|"human" }` — 대시보드는 by="visitor"만 "입력 중…" 표시 |
| `read.update` | `{ conversationId, by: "visitor"\|"agent", lastMessageId }` — 대시보드는 by="visitor"로 상담원 마지막 메시지에 "읽음" 표시 |
| `handoff.new` | `{ conversationSummary, reason, summary }` — 브라우저 알림 트리거 |
| `suggestion.new` | `{ suggestion }` — 어시스트 패널. **agent 채널에만 발행** |
| `presence.update` | `{ conversationId, visitorOnline: bool }` |

### 5.5 PubSub 채널 설계 (내부)
```
ws:{workspaceId}:inbox        → inbox.upsert, handoff.new
conv:{conversationId}:all     → message.new, typing, conversation.updated  (visitor+agent 공용)
conv:{conversationId}:agents  → suggestion.new  (⚠️ visitor 소켓은 이 채널을 절대 구독하지 않음)
```
- WS Gateway는 로컬 연결 레지스트리(`Map<connId, {kind, workspaceId, subscriptions}>`)를 들고, PubSub 수신분을 자격에 맞는 소켓에만 fan-out.

## 6. 공유 객체 형태 (shared zod와 1:1)
```ts
Message = { id, conversationId, role, authorId, content: { type: "text", text, quickReplies?: string[] }, createdAt }
Conversation = { id, workspaceId, visitorId, status, mode, assigneeId, lastMessageAt, visitorLastReadMessageId, agentLastReadMessageId, metadata, createdAt }
ConversationSummary = { conversation, visitor: { id, name, email }, lastMessage: { textPreview, role, createdAt } }
Suggestion = { id, conversationId, triggerMessageId, draft, rationale, actions, source, outcome, createdAt }
Event = { id, type, actor, payload, createdAt }
```

## 7. 에러 코드 표 (전체 — AppError.code는 이 표만)
| code | HTTP | 의미 |
|---|---|---|
| `auth/invalid` | 401 | 인증 실패/토큰 무효 |
| `auth/forbidden` | 403 | 권한 없음(타 워크스페이스, visitor의 상담원 자원 접근 등) |
| `validation/failed` | 400 | zod 검증 실패 (details에 필드 오류) |
| `not_found` | 404 | 리소스 없음 / S2에 트래킹 API 접근 |
| `rate/limited` | 429 | 레이트리밋 |
| `plan/limit_exceeded` | 402 | 플랜 한도 초과(대화 수/시트) |
| `agent/timeout` | 504 | 에이전트 응답 타임아웃 (test 엔드포인트 응답 등에서) |
| `agent/bad_response` | 502 | 에이전트 응답 스키마 불일치 |
| `conversion/duplicate` | 409 | 동일 external_ref 재수신 (내부용 — /t/*는 204로 감춤) |
| `conflict` | 409 | 기타 상태 충돌(이미 active agent 존재 등) |
| `internal` | 500 | 미처리 서버 내부 오류 (상세는 로그에만, 응답엔 일반 문구) |
