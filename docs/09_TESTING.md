# 09_TESTING.md — 테스트 전략 & 필수 케이스

> "필수" 표시 영역은 테스트 없이 해당 기능을 완료 처리할 수 없다(CLAUDE.md 작업 방식). 그 외 UI는 핵심 플로우만.

## 1. 도구/구성
- 단위·통합: **Vitest**. 통합 테스트는 testcontainers(또는 docker compose 서비스)로 실제 Postgres+Redis 사용 — DB mocking 금지(쿼리/인덱스 회귀를 잡기 위함).
- 위젯 E2E: **Playwright** — 정적 HTML 호스트 + Next.js 호스트 픽스처, 모의 에이전트 서버(고정 응답/지연/에러 주입 가능) 포함.
- CI(GitHub Actions): lint → typecheck → vitest → widget size-limit → playwright. 전부 통과해야 머지.

## 2. 필수 커버리지 A — 메시징 신뢰성 (apps/server + widget)
1. **순서 보장**: 동시 전송 20건 → listAfter 결과가 createdAt,id 정렬로 안정.
2. **중복 제거**: 동일 (conversationId, clientMsgId) 2회 send → 메시지 1건, 두 번째는 동일 message로 ack.
3. **재연결 동기화**: WS 끊김 중 서버측 메시지 3건 발생 → 재연결 후 after cursor 동기화로 정확히 3건 수신, 중복 0.
4. **미ACK 재전송**: ack 유실 시뮬레이션 → 클라이언트 재전송 → 최종 메시지 1건.
5. long-poll 폴백 경로에서 1,2 동일 보장.

## 3. 필수 커버리지 B — Agent Dispatcher
1. reply 정상 → 메시지 저장·브로드캐스트, track_links URL 치환, tracked_links 생성, failure_count=0.
2. handoff → mode=human, 이벤트 기록, message_to_visitor 발송, 이후 손님 메시지에 reply dispatch 미발생.
3. 타임아웃/5xx/스키마 불일치/64KB 초과 → 자동 핸드오프 + 기본 안내 + agent_logs outcome 정확, failure_count 증가.
4. 연속 5회 실패 → status=auto_disabled, 6번째 dispatch 미발생.
5. HMAC: 서명/타임스탬프가 스펙과 일치(고정 secret·body로 기대 해시 스냅샷).
6. mode=assist: suggest 저장 + **agents 채널에만 publish** / assist 실패 시 핸드오프·failure_count 변화 없음 / noop 무동작.
7. mode 불일치 응답(assist에 reply 등) → 에러 처리.

## 4. 필수 커버리지 C — 권한 격리 (08 문서 §3 불변식)
1. visitor_token으로 `/v1/workspaces/...` 전 경로 → 401/403 (경로 파라미터 fuzz 최소 5경로).
2. visitor_token으로 suggestions 조회 시도 → 403. visitor WS 소켓이 suggestion.new를 수신하지 않음(통합 테스트: 같은 대화에 agent 소켓과 visitor 소켓 동시 연결 후 suggest 발생).
3. 타 워크스페이스 member의 자원 접근 → 403.
4. 위조 visitor_token(서명 불일치) → 401.

## 5. 필수 커버리지 D — 전환 트래킹
1. reply text 내 URL 2개 → tracked_links 2건, at_l 토큰 상이, 치환된 text 검증.
2. /t/click 최초 → clickedAt 기록, 2회째 → 값 불변(최초 클릭 유지), 무효 토큰 → 204(무시).
3. /t/conversion externalRef 중복 → conversions 1건 유지, 응답 204.
4. 귀속: 동일 visitor에 클릭된 링크 2개(대화 A, B) → last_click 규칙이면 B, first_click이면 A로 집계.
5. S2 워크스페이스에서 트래킹 API → 404.

## 6. 필수 커버리지 E — Plan 제한 (ee)
1. starter 한도 1,000 도달 후 새 대화 → 402 plan/limit_exceeded, **기존 대화 메시지는 정상 동작**.
2. 시트 3 초과 초대 → 402. oss(Noop enforcer)에서는 무제한 통과.
3. 카운트 시점: conversation 생성 시 +1, 메시지 추가로는 불변.

## 7. 위젯 E2E (Playwright — 06 문서 §8 시나리오 5종)
브라우저 매트릭스: Chromium + WebKit(데스크톱/iPhone 뷰포트). 카페24·아임웹 실측은 M2 수동(결과를 06 문서에 반영).

## 8. 픽스처/헬퍼 규약
- `test/factories.ts`: `makeWorkspace() / makeVisitor() / makeConversation()` 등 — 모든 통합 테스트가 공유.
- 모의 에이전트: `test/mock-agent.ts` — `setBehavior({ mode, response | delayMs | status })`로 시나리오 주입.
- 각 테스트는 트랜잭션 롤백 또는 workspace 단위 격리로 독립 실행 보장.
