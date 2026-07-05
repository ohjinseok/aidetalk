# 03_DATA_MODEL.md — DB 스키마

> 실제 단일 출처는 `packages/db/src/schema/`. 이 문서의 Drizzle 코드는 초기 구현 시 그대로 옮겨 적을 수 있는 수준으로 작성했다. 어긋나면 코드를 따르되 이 문서를 같은 커밋에서 갱신한다.

## 0. 공통 규칙
- ID: 전부 `text`, `prefix_` + nanoid(16). 예 `ws_V1StGXR8Z5jdHi6B`. **serial/uuid 금지.** 생성 유틸: `packages/shared/src/id.ts`의 `newId(prefix)`.
- 모든 테이블에 `created_at timestamptz not null default now()`. 변경 가능한 테이블은 `updated_at`도.
- soft delete 없음(v1). closed 상태로 충분. GDPR류 삭제는 hard delete repo 함수만 별도 제공.
- 카운터 비정규화 안 함(v1). 미읽음 수 등은 쿼리로.
- `ee/` 전용 테이블(subscriptions, invoices, billing_keys, usage_counters)은 `ee/db/`의 별도 마이그레이션 세트 — 코어 스키마와 섞지 않는다.

## 1. ERD

```
workspaces 1─N members (users 조인)      workspaces 1─N agents 1─N agent_logs
workspaces 1─N invites (미가입 이메일)   workspaces 1─N webhooks (Should)
workspaces 1─N visitors
workspaces 1─N conversations 1─N messages
conversations 1─N conversation_events
conversations 1─N tracked_links ─N conversions     (전환 트래킹, S1)
conversations 1─N assist_suggestions               (상담 어시스트)
```

## 2. Drizzle 스키마 (packages/db/src/schema/*.ts)

```ts
import { pgTable, text, jsonb, integer, timestamp, uniqueIndex, index, boolean } from "drizzle-orm/pg-core";

const ts = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------- workspaces ----------
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),                       // ws_
  name: text("name").notNull(),
  segment: text("segment").notNull().default("s1_site"), // 's1_site' | 's2_no_site' — 기능 노출 분기
  plan: text("plan").notNull().default("oss"),       // 'oss' | 'starter' | 'pro' (셀프호스팅은 항상 oss)
  widgetSettings: jsonb("widget_settings").notNull().default({}),
  // widgetSettings 형태(zod: shared/widget-settings.ts):
  // { primaryColor: "#4F46E5", greeting: string, tone: "formal"|"casual",
  //   launcherPosition: "right"|"left", officeHours: { enabled, tz, rules: [{days:[1..7], open:"09:00", close:"18:00"}],
  //   offHoursMessage: string } }
  // officeHours.rules 판정 규칙(서버 lib/widget-settings 평가와 1:1):
  //   open < close  → [open, close) 반열림(예 09:00~18:00)
  //   open > close  → 자정 넘김: [open, 24:00) ∪ [00:00, close) (예 22:00~02:00)
  //   open == close → 24시간 영업(해당 요일 항상 운영시간)
  attributionRule: text("attribution_rule").notNull().default("last_click"), // 'last_click' | 'first_click'
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- users / members ----------
export const users = pgTable("users", {
  id: text("id").primaryKey(),                       // usr_
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),      // argon2id
  name: text("name").notNull(),
  createdAt: ts(),
});

export const members = pgTable("members", {
  id: text("id").primaryKey(),                       // mbr_
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),                      // 'owner' | 'agent_member'
  status: text("status").notNull().default("active"),// 'invited' | 'active'
  inviteToken: text("invite_token"),                 // 초대 수락 전까지만 값 존재
  createdAt: ts(),
}, (t) => [uniqueIndex("members_ws_user").on(t.workspaceId, t.userId)]);

// ---------- invites (미가입 이메일 멤버 초대) ----------
// members는 user_id NOT NULL FK라 아직 가입하지 않은 이메일을 담을 수 없다.
// invites는 "이메일 + 역할 + 토큰"만 담고, 초대 대상이 가입/로그인해 토큰을 수락하면 members 행을 만든다.
export const invites = pgTable("invites", {
  id: text("id").primaryKey(),                       // inv_
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  email: text("email").notNull(),                    // 초대 대상 이메일(미가입일 수 있음)
  role: text("role").notNull(),                      // 'owner' | 'agent_member'
  tokenHash: text("token_hash").notNull(),           // sha256(raw token). 원문 저장 금지(규칙 5), inviteUrl로 1회 노출
  invitedBy: text("invited_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // 발급 + 7일
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),         // 수락 전 null(멱등/재수락 거부)
  createdAt: ts(),
}, (t) => [index("invites_ws_email").on(t.workspaceId, t.email)]);
// 수락 흐름: POST /v1/invites/accept — 로그인 사용자 이메일 == invite.email 확인, 만료/재수락 거부,
//   markAccepted(원자적) 후 members 행 생성.

// ---------- agents (AI 커넥터) ----------
export const agents = pgTable("agents", {
  id: text("id").primaryKey(),                       // agt_
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  endpointUrl: text("endpoint_url").notNull(),       // 클라우드: https 필수
  secretHash: text("secret_hash").notNull(),         // sha256(secret). 원문은 생성 시 1회 노출
  secretEnc: text("secret_enc").notNull(),           // AES-256-GCM(secret) — 아웃바운드 HMAC 서명용, 서명 시에만 복호화 (08 §1)
  status: text("status").notNull().default("active"),// 'active' | 'disabled' | 'auto_disabled'
  failureCount: integer("failure_count").notNull().default(0), // reply 연속 실패, 성공 시 0
  timeoutMs: integer("timeout_ms").notNull().default(30000),
  assistEnabled: boolean("assist_enabled").notNull().default(true),
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
// 제약(코드 레벨): workspace당 status=active인 agent는 최대 1개 (라우팅 단순화, N개는 v2)

// ---------- visitors ----------
export const visitors = pgTable("visitors", {
  id: text("id").primaryKey(),                       // vis_
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  email: text("email"), name: text("name"), phone: text("phone"),
  attributes: jsonb("attributes").notNull().default({}), // 유저 정의 { "주문번호": "...", "등급": "VIP" }
  firstReferrer: text("first_referrer"),             // discovery 대비 유입 기록 (PRD §9.5)
  firstPageUrl: text("first_page_url"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  mergedInto: text("merged_into"),                   // self FK. 이메일 병합 시 원본 보존
  createdAt: ts(),
}, (t) => [index("visitors_ws_email").on(t.workspaceId, t.email)]);

// ---------- conversations ----------
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),                       // conv_
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  visitorId: text("visitor_id").notNull().references(() => visitors.id),
  status: text("status").notNull().default("open"),  // 'open' | 'pending' | 'closed'
  mode: text("mode").notNull().default("ai"),        // 'ai' | 'human' — 핸드오프 핵심 상태
  assigneeId: text("assignee_id"),                   // FK users, mode=human일 때 담당
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  // 양방향 읽음 표시(read receipts) — 각 주체가 읽은 마지막 메시지 id. 미읽음이면 null.
  // 비교는 id 정렬이 아니라 대상 메시지의 created_at으로 한다(msg_ nanoid는 단조 아님).
  visitorLastReadMessageId: text("visitor_last_read_message_id"),
  agentLastReadMessageId: text("agent_last_read_message_id"),
  metadata: jsonb("metadata").notNull().default({}), // { startPageUrl, referrer, uaSummary }
  createdAt: ts(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("conv_inbox").on(t.workspaceId, t.status, t.lastMessageAt)]);
// mode 정의: agent 미등록 워크스페이스의 새 대화는 mode='human'으로 시작

// ---------- messages ----------
export const messages = pgTable("messages", {
  id: text("id").primaryKey(),                       // msg_ (nanoid는 단조 아님 → 정렬은 created_at, id 보조키)
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  clientMsgId: text("client_msg_id"),                // 위젯 임시 ID
  role: text("role").notNull(),                      // 'visitor' | 'agent_ai' | 'agent_human' | 'system'
  authorId: text("author_id"),                       // role별 visitor/user/agent id, system은 null
  content: jsonb("content").notNull(),               // { type:"text", text, quickReplies?: string[] }
  createdAt: ts(),
}, (t) => [
  uniqueIndex("msg_dedupe").on(t.conversationId, t.clientMsgId), // 중복 제거 (clientMsgId null은 unique 미적용 — Postgres 기본 동작 OK)
  index("msg_order").on(t.conversationId, t.createdAt),
]);
// 순서 보장: ORDER BY created_at, id. 클라이언트는 서버 타임스탬프만 신뢰.

// ---------- conversation_events (감사 추적) ----------
export const conversationEvents = pgTable("conversation_events", {
  id: text("id").primaryKey(),                       // evt_
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  type: text("type").notNull(),
  // 'handoff_auto'(에이전트 실패) | 'handoff_agent'(에이전트 handoff 응답) | 'handoff_requested'(손님 요청 버튼)
  // | 'returned_to_ai' | 'assigned' | 'unassigned' | 'closed' | 'reopened'
  actor: text("actor").notNull(),                    // 'system' | 'agent:{agt_id}' | 'user:{usr_id}' | 'visitor:{vis_id}'
  payload: jsonb("payload").notNull().default({}),   // handoff면 { reason, summary }
  createdAt: ts(),
}, (t) => [index("evt_conv").on(t.conversationId, t.createdAt)]);

// ---------- agent_logs (AI observability) ----------
export const agentLogs = pgTable("agent_logs", {
  id: text("id").primaryKey(),                       // alg_
  agentId: text("agent_id").notNull().references(() => agents.id),
  conversationId: text("conversation_id").notNull(),
  messageId: text("message_id"),                     // 트리거된 손님 메시지
  mode: text("mode").notNull(),                      // 'reply' | 'assist'
  requestSummary: jsonb("request_summary").notNull(),// history 본문 제외 요약 { messageText: 앞200자, historyCount }
  responseSummary: jsonb("response_summary"),        // { type, textPreview: 앞500자, latencyMs, httpStatus }
  outcome: text("outcome").notNull(),                // 'reply'|'handoff'|'noop'|'suggest'|'timeout'|'error'
  createdAt: ts(),
}, (t) => [index("alog_agent").on(t.agentId, t.createdAt)]);
// 보존: 셀프호스팅 무제한 / 클라우드는 PlanEnforcer.getLogRetentionDays 기반 일배치 삭제(ee)

// ---------- tracked_links (전환 트래킹, S1) ----------
export const trackedLinks = pgTable("tracked_links", {
  id: text("id").primaryKey(),                       // tlk_
  token: text("token").notNull().unique(),           // URL 파라미터 at_l 값 (짧은 nanoid 10)
  workspaceId: text("workspace_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  visitorId: text("visitor_id").notNull(),
  messageId: text("message_id"),                     // 링크가 담겨 나간 메시지
  targetUrl: text("target_url").notNull(),           // 원본 링크
  clickedAt: timestamp("clicked_at", { withTimezone: true }), // 미클릭 null
  createdAt: ts(),
}, (t) => [index("tlk_conv").on(t.conversationId)]);

// ---------- conversions ----------
export const conversions = pgTable("conversions", {
  id: text("id").primaryKey(),                       // cvn_
  workspaceId: text("workspace_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  visitorId: text("visitor_id").notNull(),
  trackedLinkId: text("tracked_link_id"),            // 있으면 어떤 링크에서 비롯됐는지
  source: text("source").notNull(),                  // 'click_only' | 'pixel' | 'commerce_api' | 'booking'(v1.5 S2)
  amount: integer("amount"),                         // 원 단위. 예약형 등은 null
  currency: text("currency").notNull().default("KRW"),
  externalRef: text("external_ref"),                 // 주문번호 등. 멱등키
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: ts(),
}, (t) => [uniqueIndex("cvn_dedupe").on(t.workspaceId, t.externalRef)]);
// 귀속 규칙은 workspaces.attribution_rule, 조회 시 계산. 원본 이벤트는 그대로 보존.

// ---------- assist_suggestions (상담 어시스트 — 상담원 전용) ----------
export const assistSuggestions = pgTable("assist_suggestions", {
  id: text("id").primaryKey(),                       // asg_
  workspaceId: text("workspace_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  triggerMessageId: text("trigger_message_id").notNull(),
  draft: text("draft").notNull(),
  rationale: text("rationale"),
  actions: jsonb("actions"),                         // [{ label, url }]
  source: text("source").notNull().default("agent"), // 'agent' | 'builtin'(Could)
  outcome: text("outcome").notNull().default("pending"), // 'pending'|'accepted'|'edited'|'ignored'
  createdAt: ts(),
}, (t) => [index("asg_conv").on(t.conversationId, t.createdAt)]);
// ⚠️ visitor 자격으로 절대 조회 불가. repo 함수 시그니처에 memberContext 필수 (09 테스트 필수 커버리지).

// ---------- webhooks (Should) ----------
export const webhooks = pgTable("webhooks", {
  id: text("id").primaryKey(),                       // whk_
  workspaceId: text("workspace_id").notNull(),
  url: text("url").notNull(),
  events: jsonb("events").notNull(),                 // ["conversation.created","conversation.closed"]
  secretHash: text("secret_hash").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: ts(),
});
```

## 3. repository 계층 (packages/db/src/repos/)

라우트 핸들러는 DB를 직접 만지지 않는다. 아래 함수 목록이 v1 전체 표면 — **모든 함수 첫 인자는 workspaceId** (visitor/message 계열은 conversation 소유 검증을 내부에서 수행).

```
workspaceRepo:  create / getById / updateSettings / updatePlan
userRepo:       create / getByEmail / verifyPassword
memberRepo:     addActive / invite / acceptInvite / getByInviteToken / listByUser / list / remove / getRole
inviteRepo:     create / getByTokenHash / markAccepted(원자적·재수락 거부) / listPending   // 미가입 이메일 초대
agentRepo:      create(secret 해시화) / update / setStatus / bumpFailure(성공시 reset) / getActive
visitorRepo:    getOrCreateByToken / updateProfile / mergeByEmail / touchLastSeen
conversationRepo: create / getById / listForInbox(status, cursor) / setMode / assign / setStatus / setReadMarker(by) / touchLastMessage
messageRepo:    append(clientMsgId 중복 시 기존 행 반환) / listAfter(cursor) / listRecent(n)
eventRepo:      append / listByConversation
agentLogRepo:   append / listByAgent(cursor) / purgeOlderThan(days)
trackedLinkRepo: createMany / markClicked(token) / listByConversation
conversionRepo: create(externalRef 충돌 시 AppError conversion/duplicate) / listByConversation / aggregateByWorkspace(period, rule)
assistRepo:     append / setOutcome / listByConversation   // memberContext 필수
webhookRepo:    create / list / remove
```

## 4. 설계 결정 기록
1. **prefix+nanoid 텍스트 ID** — 디버깅 가독성 + 노출 안전. serial 금지.
2. **content jsonb** — quick_replies/이미지/카드 확장을 마이그레이션 없이 수용.
3. **soft delete 없음(v1)** — closed로 충분. GDPR 대응은 hard delete 함수.
4. **repo 함수 workspaceId 필수** — 테넌트 격리를 타입 레벨 강제.
5. **전환은 원본 이벤트 보존 + 조회 시 귀속** — 규칙이 바뀌어도 재해석 가능. "기여 추정" 정직성을 스키마(source 등급)에 반영.
6. **conversions는 매출/행동 공용** — S2 예약도 같은 테이블(source=booking, amount=null). 세그먼트 늘어도 테이블 안 쪼갬.
7. **assist_suggestions 상담원 전용** — 권한 분리를 repo 시그니처 + 테스트로 강제.
8. **ee 테이블 분리** — 코어 마이그레이션은 셀프호스터에게 ee 흔적을 남기지 않는다.
