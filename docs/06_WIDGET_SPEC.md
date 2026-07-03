# 06_WIDGET_SPEC.md — 임베드 위젯 구현 명세

> apps/widget. 전체 일정에서 가장 위험한 컴포넌트 — 이 문서 범위 밖의 추측 구현 금지, 모르면 TODO(question).
> 하드 제약: **본체 번들 ≤ 50KB gzipped (CI에서 초과 시 빌드 실패)**, React 금지(Preact), 모든 스타일 Shadow DOM 내부.

## 1. 임베드 방식

유저가 사이트에 넣는 코드 (이 스니펫은 MIT):
```html
<script>
  window.AideTalk = { workspaceId: "ws_xxx" };
</script>
<script async src="https://{host}/widget.js"></script>
```

### 1.1 로더(widget.js, ≤2KB, 의존성 0, 순수 JS)
책임:
1. `window.AideTalk.workspaceId` 확인 (없으면 console.warn 후 종료)
2. URL에 `at_l` 파라미터 있으면 `POST /t/click` 발사 후 `history.replaceState`로 파라미터 제거 (본체 로드와 무관하게 최우선 — 트래킹 유실 방지)
3. `document.createElement("div")` → `attachShadow({mode:"open"})` → 본체 `<script src="/widget/v{n}/app.js">` 비동기 로드 (버전 n은 로더에 빌드 시 주입)
4. 본체 로드 실패 시 조용히 무동작 (호스트 사이트에 어떤 에러도 던지지 않는다)

→ 유저 사이트 수정 없이 본체만 재배포 가능. 로더는 max-age=300, 본체는 immutable.

## 2. UI 구성 (Shadow DOM 내부, Preact)

```
<Launcher>            우하단(설정으로 좌하단) 원형 버튼, 미읽음 뱃지
<ChatWindow>          380×640px 카드(모바일: 전체화면). 열림/닫힘 상태는 sessionStorage
  <Header>            워크스페이스 이름, "상담원 연결" 메뉴, 닫기
  <MessageList>       말풍선(visitor 우측/상대 좌측), 시스템 라인, 날짜 구분선, 타이핑 인디케이터
  <QuickReplies>      마지막 메시지의 quickReplies 버튼 (누르면 그 텍스트로 message.send)
  <EmailPrompt>       첫 메시지 전송 후 1회 노출: "답변 놓치지 않게 이메일 남기기" (건너뛰기 가능) → PATCH /profile
  <Composer>          textarea 자동 높이, Enter 전송(Shift+Enter 줄바꿈), 전송 버튼
```
- 색상은 widgetSettings.primaryColor를 CSS 변수 `--od-primary`로 주입. 나머지 스타일은 전부 고정 팔레트.
- 모든 문구는 i18n 키(packages/i18n, 위젯 번들에는 ko만 포함 v1).
- z-index 2147483000, `position: fixed`. 호스트 CSS 영향 차단은 Shadow DOM + 모든 요소 명시적 스타일로.

## 3. 상태 머신

```
[Idle] --런처클릭--> [Boot: POST /v1/widget/session]
  ├ openConversationId 있음 → 그 대화 로드 (GET messages)
  └ 없음 → 첫 메시지 전송 시점에 POST /conversations (그 전엔 인사말만 로컬 표시)
[Ready] ⇄ WS 연결 상태와 독립 (아래 §4)
```
- visitor_token: `localStorage["od_vt_{workspaceId}"]`. session 호출에 existingToken으로 항상 동봉.
- SPA 라우팅: 위젯은 한 번 마운트되면 URL 변화와 무관하게 유지. `pageUrl`은 메시지 전송 시점 값이 아니라 세션 시작 값만 기록(v1 단순화).

## 4. 연결 & 신뢰성 (테스트 필수 영역)

### 4.1 전송 파이프라인
```
사용자 전송 → clientMsgId = newId("cm") 생성 → 로컬 큐 push + 임시 말풍선(pending 스타일)
→ WS 연결 중이면 message.send 발사
→ message.ack 수신 → 큐에서 제거, 말풍선 확정(서버 message로 치환)
→ 5초 내 ack 없으면 재전송 (같은 clientMsgId — 서버가 중복 제거하므로 안전)
→ 재연결 성공 시 큐 전체 재전송 + GET messages?after={마지막 확정 메시지 cursor}로 누락 수신분 동기화
```
- 수신 중복 방지: MessageList는 message.id 기준 upsert.
- 순서: 서버 createdAt 기준 정렬만 신뢰. 로컬 pending은 항상 맨 아래.

### 4.2 WS 연결 관리
- 접속: `wss://{host}/ws/visitor?token=...`
- 재연결: 지수 백오프 1s→2s→4s→8s→16s(최대), ±30% 지터.
- `visibilitychange`(visible 복귀) 시 즉시 재연결 시도 — iOS Safari 백그라운드 WS 끊김 대응.
- **long-poll 폴백**: WS 최초 연결이 10초 내 3회 실패하면 폴백 모드 전환 — 전송은 `POST .../messages`, 수신은 2초 간격 `GET .../messages?after=` 폴링. 폴백 중에도 60초마다 WS 재시도, 성공 시 복귀.

### 4.3 모바일
- iOS 키보드: `visualViewport` resize 이벤트로 ChatWindow 높이 재계산 (`window.visualViewport.height` 기준).
- ≤640px 뷰포트: ChatWindow 전체화면 + body 스크롤 잠금(열림 동안).

## 5. 트래킹 연동
- 로더가 `at_l` 클릭 보고 (§1.1).
- (v1.5) 전환 스크립트는 위젯과 별개 1줄: `<script src="/t/pixel.js" data-workspace="ws_xxx" data-ref="{주문번호}" data-amount="45000"></script>` — 내부에서 `POST /t/conversion`. 위젯 본체에 포함하지 않는다(결제완료 페이지에 위젯이 없을 수 있음).

## 6. CSP / 임베드 환경 문서화 (유저 문서에 포함할 내용)
- 필요 지시문: `script-src {host}`, `connect-src {host} wss://{host}`.
- nonce 사용 사이트: 로더 스크립트 태그에 nonce 지원(본체는 로더가 주입하므로 `strict-dynamic` 안내).
- 카페24/아임웹: `TODO(question)` — 실측 후 이 섹션 갱신 (M2). 추측으로 코드 넣지 말 것.

## 7. 번들 예산 관리
- CI: `pnpm --filter widget build && size-limit` — app.js gzip 50KB 초과 시 실패, 로더 2KB 초과 시 실패.
- 의존성 추가 규칙: PR 설명에 size-limit 전/후 수치 필수 (CLAUDE.md 규칙 3).

## 8. E2E 시나리오 (Playwright — 09 문서와 연동)
1. 정적 HTML 호스트에서 임베드 → 런처 → 메시지 전송 → (모의 에이전트) 응답 수신
2. Next.js 호스트에서 클라이언트 라우팅 3회 후 대화 유지
3. 오프라인 토글 10초 → 그 사이 전송 2건 → 온라인 복귀 → 유실 0·중복 0·순서 유지
4. 새로고침 후 동일 대화 복원
5. quickReplies "상담원 연결" → handoff → 시스템 라인 표시
