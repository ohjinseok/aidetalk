# 02_ARCHITECTURE.md — 시스템 설계

> 스택/구조 변경은 이 문서를 먼저 수정하고 CLAUDE.md에 반영한다.

## 1. 설계 원칙

1. **얇은 코어**: 우리는 메시지 라우팅 + 상태 + UI만. 비싼 컴퓨팅(LLM, 에이전트 실행)은 전부 유저 측.
2. **셀프호스팅이 기본, 클라우드는 그 위의 운영 계층**: 코어는 일반 Node + Docker로 어디서나 구동. 특정 벤더 전용 런타임(Cloudflare DO 등)에 코어를 묶지 않는다 — 묶으면 셀프호스팅이 불가능해져 우리가 비판한 lock-in과 같아진다. 클라우드 전용 코드는 전부 `ee/`.
3. **단순하게 시작, 확장 경로는 열어둠**: v1은 서버 1프로세스 + Postgres + Redis. Redis는 pub/sub·presence·rate limit(휘발 허용, 영속은 Postgres). 수평 확장 시 server 프로세스만 늘리면 됨.
4. **계약 우선**: 모든 경계(위젯↔서버, 서버↔에이전트, 대시보드↔서버)는 `packages/shared`의 zod 스키마로 먼저 정의.
5. **추상화는 딱 3곳**: DB, 파일 저장, 실시간 전파. 그 외(인증, 라우팅)는 추상화하지 않는다.

### 1-1. 인프라 추상화 경계

핵심 통찰: 무료/유료보다 **"WebSocket 상시 연결 지원 여부"가 진짜 갈림길**. 서버리스 무료 플랜(Vercel류)은 영구 WS를 못 든다. Cloudflare DO는 WS가 되지만 벤더 전용 → 셀프호스팅과 충돌.
→ 결론: **항상-켜진 Node 프로세스가 소켓을 드는 모델 하나로 고정.** WS "연결 보유"는 추상화하지 않는다(런타임마다 모델이 근본적으로 달라 추상화 비용이 큼).

| 계층 | 추상화 | 기본 구현 | 교체 옵션 |
|---|---|---|---|
| DB | Drizzle ORM | Postgres | Neon/Supabase/자체 (전부 동일 Postgres) |
| 파일 저장 | `StorageAdapter` | 로컬 디스크 | S3/R2/MinIO (S3 호환) |
| 실시간 전파 | `PubSubAdapter` | Redis | in-memory(단일 프로세스 미니멀 모드) |

```ts
// packages/shared/src/adapters.ts
export interface StorageAdapter {
  put(key: string, data: ReadableStream | Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<ReadableStream>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, expiresInSec: number): Promise<string>;
}
export interface PubSubAdapter {
  publish(channel: string, msg: string): Promise<void>;
  subscribe(channel: string, handler: (msg: string) => void): Promise<() => void>; // 반환값 = unsubscribe
}
```
- 구현 선택은 환경변수(10_DEPLOYMENT.md): `PUBSUB_DRIVER=redis|memory`, `STORAGE_DRIVER=local|s3`.
- in-memory pubsub은 단일 프로세스 전용 — 부팅 시 다중 인스턴스 감지 불가하므로 문서로만 경고.

## 2. 시스템 구성도

```
[방문자 브라우저]                         [상담원 브라우저]
   widget (Preact)                        dashboard (Next.js)
      │ WS(/ws/visitor) + HTTP                │ WS(/ws/agent) + HTTP
      ▼                                       ▼
┌──────────────────────────────────────────────────────────┐
│ apps/server — Hono + ws, 항상-켜진 단일 Node 프로세스       │
│                                                          │
│  HTTP API(REST/zod)   WS Gateway(연결 레지스트리)          │
│  Agent Dispatcher(HTTP relay, HMAC)   Tracking(/t/*)     │
│           │                                              │
│       PubSubAdapter(기본 Redis)   PlanEnforcer(주입)      │
└──────┬──────────┬──────────────────┬─────────────────────┘
       ▼          ▼                  ▼ POST (HMAC 서명, 타임아웃 30s)
  PostgreSQL    Redis          [유저의 Agent endpoint]
  (원본 데이터)  (pub/sub·presence  (유저 서버, 유저 LLM key)
               ·rate limit)
  + StorageAdapter(기본 로컬 디스크)
```

## 3. 핵심 플로우

### 3.1 방문자 메시지 → AI 응답
```
1. widget → WS: { type: "message.send", payload: { clientMsgId, text } }
2. server: (conversation_id, client_msg_id) unique로 중복 제거 → DB 저장
   → 위젯에 message.ack → conversation 참여자 전체에 message.new 브로드캐스트(PubSub)
3. conversation.mode === "ai" && active agent 존재 시 Agent Dispatcher가 POST
   - 본문/헤더: 05_AGENT_PROTOCOL.md
   - 디스패치 전 위젯에 typing.start 이벤트 (AI가 생각 중 표시)
4. 응답 처리:
   - type=reply  → role=agent_ai 메시지 저장·브로드캐스트. track_links=true면 URL 태깅(§3.4)
   - type=handoff → conversation.mode="human", conversation_events 기록,
                    message_to_visitor(또는 기본 문구) 전송, 상담원에게 handoff 알림 push
   - type=noop  → 아무것도 안 함
   - 타임아웃/5xx/스키마 불일치 → 자동 핸드오프 + 기본 안내 메시지 + agent_logs(outcome=timeout|error)
     + agents.failure_count++ → 연속 5회 시 status=auto_disabled + owner 이메일
5. 모든 dispatch는 agent_logs에 요약 기록
```
- 디스패치는 **메시지당 1회, 재시도 없음**(v1) — 에이전트 측 멱등성 부담 제거.
- 동시성: 같은 대화에 AI 응답 대기 중 새 손님 메시지 도착 시, 진행 중 dispatch는 그대로 두고 새 메시지에 대해 새 dispatch (에이전트가 history로 맥락 파악). v1은 이 단순 규칙 고정.

### 3.2 핸드오프 이후
- mode="human" 동안 Dispatcher의 reply 호출은 중단. 대신 손님 메시지마다 **assist 호출**(§3.5)은 수행.
- 상담원 "AI에게 반환" → mode="ai" 복귀. 모든 전환은 `conversation_events`에 기록(감사 추적).

### 3.3 세션/식별
- 방문자: 위젯 첫 로드 시 `POST /v1/widget/session` → 서명된 `visitor_token`(HMAC, §04 문서 §2.2) 발급 → localStorage 보관. 재방문 시 동일 visitor. 이메일 입력 시 같은 이메일 visitor와 병합(`merged_into`).
- 상담원: 이메일+비밀번호, 서버 세션 쿠키(httpOnly). OAuth는 클라우드 단계(v1.x).

### 3.4 매출 전환 트래킹 (S1)
```
1. reply(track_links=true)의 text에서 URL 추출 → tracked_links 저장
   → URL을 `원본URL + ?at_l={tlk 짧은토큰}`으로 치환해 발송
2. 손님이 링크 클릭 → 사이트 재진입 → 위젯 로더가 at_l 파라미터 감지
   → POST /t/click { token } → clicked_at 기록 (파라미터는 히스토리에서 제거)
3. (v1.5) 결제완료 페이지 전환 스크립트 → POST /t/conversion { external_ref, amount, ... }
   → visitor_token 쿠키/localStorage로 방문자 식별 → 귀속 후보 tracked_link 탐색
4. conversions 저장(external_ref로 멱등) → 대시보드가 귀속 규칙(설정값) 적용해 집계
```
- 원본 이벤트는 규칙과 무관하게 보존, 귀속은 조회 시 계산. S2 예약 전환(v1.5)은 같은 conversions 재사용(source=booking, amount=null).

### 3.5 실시간 상담 어시스트
```
1. mode=human 대화에 손님 메시지 도착
2. Dispatcher가 같은 endpoint를 mode="assist"로 POST (reply와 별개 호출)
3. type=suggest → assist_suggestions 저장 → 상담원 WS 채널로만 push
4. 상담원 채택/수정/무시 → PATCH로 outcome 기록
```
- assist 실패(타임아웃/에러/noop)는 핸드오프하지 않고 조용히 스킵. failure_count에도 반영하지 않음(reply 실패만 카운트).
- 권한: assist 데이터는 상담원 WS/REST 전용. visitor 자격으로 접근 시 `auth/forbidden`.

## 4. 위젯 설계 요약 (상세: 06_WIDGET_SPEC.md)
- Shadow DOM + 인라인 스타일 격리 / ~2KB 로더 + 버전된 본체 비동기 로드 / WS 기본 + long-poll 폴백 / clientMsgId+ACK 신뢰성 / iOS visualViewport·visibilitychange 대응 / CSP 문서화 / CI 매트릭스(Next.js·카페24·아임웹 × Chrome·Safari·iOS Safari).

## 5. Agent 커넥터 보안 (상세: 08_SECURITY.md)
- 등록 시 secret 생성(1회 노출, DB엔 sha256 해시) / 모든 요청 HMAC + timestamp(±5분) / endpoint https 강제(셀프호스팅은 설정으로 완화) / 클라우드는 사설 IP dispatch 차단(SSRF) / 응답 64KB 제한 / 연속 5회 실패 auto_disable.

## 6. 멀티테넌시
- 클라우드 v1: 공유 DB + `workspace_id` 컬럼 격리(row-level). **모든 repo 함수는 workspaceId 필수 첫 인자.**
- Postgres RLS는 v1.x 검토. 셀프호스팅도 같은 스키마(코드 분기 없음).

## 7. 관측성 (v1 최소)
- pino JSON 구조화 로그 + `x-request-id` 전파.
- agent dispatch 요약 → `agent_logs` (대시보드 "AI 로그" 화면의 데이터 소스).
- 메트릭은 로그 기반 집계로 충분: 활성 WS 수, dispatch p95, 핸드오프율. Prometheus는 나중.

## 8. 의도적으로 미룬 것
- 메시지 큐(BullMQ): dispatch가 동기 HTTP라 불필요. 스트리밍 도입 시 재검토.
- 수평 확장: PubSub가 Redis라 서버 N대는 바로 가능하나 초기엔 1대(WS 1만 연결까지 충분).
- 파일 업로드(v1.x — StorageAdapter로 경계만), E2E 암호화(비범위), Postgres RLS(v1.x).
