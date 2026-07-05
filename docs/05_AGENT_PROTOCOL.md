# 05_AGENT_PROTOCOL.md — AideTalk ↔ 유저 Agent HTTP 계약 (v1)

> 외부 공개 문서. `packages/shared/src/agent-protocol.ts`의 zod 스키마와 1:1 대응한다.
> 이 계약은 언어 중립이므로 **snake_case** 표기를 쓴다(내부 API의 camelCase와 구분).

## 개요

유저의 AI Agent는 언어/프레임워크 무관 — 아래 계약을 지키는 HTTP 서버 1개면 된다. LLM 호출, 도구 사용, 비즈니스 로직은 전부 에이전트 쪽 자유.

```
AideTalk ──POST──▶ 유저의 endpoint
         ◀─JSON── reply / handoff / noop   (mode=reply: 손님에게 나갈 응답)
         ◀─JSON── suggest / noop           (mode=assist: 상담원에게만 보이는 제안)
```

- `mode: "reply"` — 결과가 손님에게 전달됨. conversation.mode=ai일 때 손님 메시지마다 호출.
- `mode: "assist"` — conversation.mode=human일 때 손님 메시지마다 호출. 결과는 **상담원에게만** 표시. 미구현이면 `{ "type": "noop" }` 반환하면 됨(어시스트 비활성과 동일).

## 요청 (AideTalk → Agent)

```http
POST {endpoint_url}
Content-Type: application/json
X-AideTalk-Timestamp: 1718000000
X-AideTalk-Signature: hex(hmac_sha256(secret, timestamp + "." + raw_body))
```

```jsonc
{
  "version": "1",
  "mode": "reply",                        // "reply" | "assist"
  "conversation_id": "conv_abc123",
  "message": {
    "id": "msg_001",
    "role": "visitor",
    "text": "배송 언제 와요?",
    "created_at": "2026-06-12T09:00:00Z"
  },
  "history": [
    // 최근 20개, 오래된 것부터. 현재 message는 미포함. role: visitor|agent_ai|agent_human|system
    { "id": "msg_000", "role": "agent_ai", "text": "안녕하세요! 무엇을 도와드릴까요?", "created_at": "..." }
  ],
  "visitor": {
    "id": "vis_xyz",
    "email": "kim@example.com",           // null 가능
    "name": null,
    "attributes": { "주문번호": "ORD-123" },
    "page_url": "https://shop.com/orders"
  },
  "workspace": {
    "id": "ws_1",
    "metadata": {}                        // 워크스페이스 설정에서 유저가 정의한 임의 값
  }
}
```

## 응답 (Agent → AideTalk) — 타임아웃(기본 30초, 설정 가능) 내에 아래 중 하나

### 1) reply — 손님에게 보낼 답변 (mode=reply 전용)
```jsonc
{
  "type": "reply",
  "text": "주문 ORD-123은 내일(6/13) 도착 예정입니다.",   // 1~4000자
  "quick_replies": ["다른 문의", "상담원 연결"],          // 선택, 최대 5개, 각 40자
  "typing_delay_ms": 600,                                // 선택, 0~3000. 발송 전 타이핑 표시 시간
  "track_links": true                                    // 선택, 기본 true. text 내 URL에 전환 추적 토큰 자동 부착
}
```
- track_links=true면 AideTalk가 text 내 URL을 `?at_l=...` 붙여 발송하고 tracked_links로 기록. 에이전트는 평범한 링크만 넣으면 된다.
- quick_replies 중 "상담원 연결"(i18n 상수와 일치하는 텍스트)을 손님이 누르면 위젯이 handoff 요청을 보낸다.

### 2) handoff — 사람에게 넘기기 (mode=reply 전용)
```jsonc
{
  "type": "handoff",
  "reason": "환불 요청",                                        // 필수. 상담원에게 표시
  "summary": "주문 ORD-123 단순변심 환불. 결제수단 카드.",        // 선택. 상담원용 요약
  "message_to_visitor": "상담원을 연결해 드릴게요. 잠시만요!"     // 선택. 기본 문구 대체
}
```

### 3) noop — 침묵
```jsonc
{ "type": "noop" }
```
방문자가 "감사합니다"만 보낸 경우 등. assist에서 제안할 게 없을 때도 사용.

### 4) suggest — 상담원 제안 (mode=assist 전용)
```jsonc
{
  "type": "suggest",
  "draft": "지금 재고가 2개 남아있어요! 오늘 주문하시면 내일 받으실 수 있습니다 :)",
  "rationale": "배송일 문의 = 구매 임박 신호. 재고 희소성 + 빠른 배송 강조 권장.",   // 선택
  "actions": [ { "label": "재입고 알림 링크 보내기", "url": "https://shop.com/notify/123" } ]  // 선택, 최대 3개
}
```
- **손님에게 절대 전달되지 않는다.** 상담원 인박스 사이드 패널 전용.
- 상담원의 채택/수정/무시가 기록되어 제안 품질 측정에 쓰인다.

### 잘못된 조합 처리
- mode=reply에 suggest 응답, mode=assist에 reply/handoff 응답 → 스키마 불일치(에러)로 처리.

## 에러 처리 (AideTalk 측 동작)
| 상황 | AideTalk 동작 |
|---|---|
| 타임아웃 / 5xx / 연결 실패 / 스키마 불일치 / 빈 body / 응답 64KB 초과 | (reply일 때) 자동 핸드오프 + 방문자 기본 안내, agent_logs outcome=timeout/error, failure_count++ |
| reply 연속 5회 실패 | agent status=`auto_disabled` + 구독한 웹훅에 `agent.auto_disabled` 발송(04 §2) + 대시보드 배너(owner 이메일은 v1에서 웹훅+배너로 대체, 이메일은 M3 클라우드에서 재검토) |
| **assist에서의 모든 실패** | 핸드오프 없이 조용히 스킵(제안만 없음). failure_count 미반영 |
| 성공 응답 | failure_count = 0 리셋 |

재시도는 하지 않는다(v1) — 동일 메시지 중복 호출이 없으므로 **에이전트는 멱등성을 신경 쓸 필요 없음**.

## 서명 검증 (에이전트 측 필수 구현)

```ts
// Node 예시
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(req: { headers: Record<string, string>; rawBody: string }, secret: string) {
  const ts = req.headers["x-aidetalk-timestamp"];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // ±5분
  const expected = createHmac("sha256", secret).update(`${ts}.${req.rawBody}`).digest("hex");
  const got = req.headers["x-aidetalk-signature"] ?? "";
  return expected.length === got.length && timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}
```

```python
# Python 예시
import hmac, hashlib, time

def verify(headers: dict, raw_body: bytes, secret: str) -> bool:
    ts = headers.get("x-aidetalk-timestamp", "")
    if abs(time.time() - float(ts or 0)) > 300: return False
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, headers.get("x-aidetalk-signature", ""))
```

## 연결 테스트
대시보드의 "연결 테스트" 버튼은 `message.text = "__aidetalk_ping__"`으로 실제 dispatch한다. 에이전트는 이 텍스트에 대해 임의의 유효한 reply를 반환하면 된다(LLM 호출 없이 고정 문자열 권장).

## 버저닝
- body의 `version`으로 관리. 호환 깨지는 변경은 version 증가 + 구버전 6개월 병행.
- 필드 추가는 minor — **에이전트는 모르는 필드를 무시해야 한다.**

## 예제 에이전트 (examples/)
- `examples/agent-node/` — Hono + Claude API. "FAQ markdown을 읽고 답하고, 모르면 handoff, assist 모드로 초안 제안"까지 포함한 최소 구현(~200줄).
- `examples/agent-python/` — FastAPI + Claude API, 동일 기능.
- 두 예제 README 첫 줄: **"이 레포를 Claude Code에 열고 '우리 쇼핑몰 정책에 맞게 고쳐줘'라고 하세요."** — 예제 자체가 온보딩 진입점.

## v1.x 로드맵 (예고만)
- SSE 스트리밍(`type: "stream"`) / 에이전트→AideTalk 능동 푸시 API / `set_attributes` 액션(방문자 속성 쓰기)
