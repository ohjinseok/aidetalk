# Agent Protocol (v1)

AideTalk와 여러분의 AI Agent가 주고받는 HTTP 계약입니다. 이 계약을 지키는 HTTP 서버 하나만
있으면 언어와 프레임워크에 상관없이 AideTalk에 연결할 수 있습니다. LLM 호출, 도구 사용,
비즈니스 로직은 전부 에이전트 쪽의 자유입니다 — AideTalk는 요청을 릴레이하고 응답을
검증할 뿐, 어떤 모델을 쓰는지 관여하지 않습니다.

이 문서는 AideTalk 서버가 실제로 검증하는 스키마와 항상 동기화됩니다. 버전이 바뀌면
아래 [버저닝](#버저닝) 규칙을 따릅니다.

::: tip 표기법
이 계약은 언어 중립이므로 **snake_case**를 씁니다. AideTalk 대시보드/내부 API가 쓰는
camelCase와는 구분되는 표기입니다.
:::

## 개요

```
AideTalk ──POST──▶ 여러분의 endpoint
         ◀─JSON── reply / handoff / noop   (mode=reply: 손님에게 나갈 응답)
         ◀─JSON── suggest / noop           (mode=assist: 상담원에게만 보이는 제안)
```

- `mode: "reply"` — 결과가 **손님에게 전달**됩니다. 대화가 AI 모드일 때 손님이 메시지를 보낼 때마다 호출됩니다.
- `mode: "assist"` — 대화가 사람 상담원 모드일 때 손님이 메시지를 보낼 때마다 호출됩니다. 결과는
  **상담원에게만** 표시됩니다. 미구현이어도 괜찮습니다 — `{ "type": "noop" }`만 반환하면
  어시스트 기능이 비활성인 것과 동일하게 동작합니다.

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

## 응답 (Agent → AideTalk)

타임아웃(기본 30초, 워크스페이스 설정에서 조정 가능) 내에 아래 중 하나를 반환해야 합니다.

### 1) reply — 손님에게 보낼 답변 (mode=reply 전용)

```jsonc
{
  "type": "reply",
  "text": "주문 ORD-123은 내일(6/13) 도착 예정입니다.",   // 1~4000자
  "quick_replies": ["다른 문의", "상담원 연결"],          // 선택, 최대 5개, 각 40자
  "typing_delay_ms": 600,                                // 선택, 0~3000. 발송 전 타이핑 표시 시간(ms)
  "track_links": true                                    // 선택, 기본 true. text 내 URL에 전환 추적 토큰 자동 부착
}
```

- `track_links: true`면 AideTalk가 `text` 안의 URL에 `?at_l=...` 파라미터를 붙여 발송하고
  클릭 여부를 추적합니다. 여러분은 평범한 링크만 넣으면 됩니다 — 자세한 동작은
  [위젯 임베드 가이드의 트래킹 섹션](/guide/widget-embed#트래킹-파라미터-at-l)을 참고하세요.
- `quick_replies` 중 "상담원 연결"(위젯 i18n 문구와 일치하는 텍스트)을 손님이 누르면 위젯이
  자동으로 handoff 요청을 보냅니다.

### 2) handoff — 사람에게 넘기기 (mode=reply 전용)

```jsonc
{
  "type": "handoff",
  "reason": "환불 요청",                                        // 필수. 상담원에게 표시됨
  "summary": "주문 ORD-123 단순변심 환불. 결제수단 카드.",        // 선택. 상담원용 요약
  "message_to_visitor": "상담원을 연결해 드릴게요. 잠시만요!"     // 선택. 기본 안내 문구를 대체
}
```

### 3) noop — 침묵

```jsonc
{ "type": "noop" }
```

방문자가 "감사합니다"만 보낸 경우처럼 답할 필요가 없을 때 사용합니다. assist 모드에서
제안할 내용이 없을 때도 동일하게 사용합니다.

### 4) suggest — 상담원 제안 (mode=assist 전용)

```jsonc
{
  "type": "suggest",
  "draft": "지금 재고가 2개 남아있어요! 오늘 주문하시면 내일 받으실 수 있습니다 :)",
  "rationale": "배송일 문의 = 구매 임박 신호. 재고 희소성 + 빠른 배송 강조 권장.",   // 선택
  "actions": [ { "label": "재입고 알림 링크 보내기", "url": "https://shop.com/notify/123" } ]  // 선택, 최대 3개
}
```

**손님에게는 절대 전달되지 않습니다.** 상담원 인박스의 사이드 패널에서만 보이며,
상담원이 채택/수정/무시한 결과가 기록되어 제안 품질 측정에 쓰입니다.

### 잘못된 조합

`mode=reply`에 `suggest` 응답을 보내거나, `mode=assist`에 `reply`/`handoff` 응답을 보내면
스키마 불일치로 처리되어 아래 에러 처리 표를 따릅니다.

## 에러 처리

AideTalk가 여러분의 엔드포인트 호출 결과를 어떻게 처리하는지입니다.

| 상황 | AideTalk 동작 |
|---|---|
| 타임아웃 / 5xx / 연결 실패 / 스키마 불일치 / 빈 body / 응답 64KB 초과 | (`mode=reply`일 때) 자동으로 상담원에게 핸드오프하고 손님에게 기본 안내 문구를 보여줌. 실패 로그가 기록되고 연속 실패 횟수가 증가 |
| `reply`에서 연속 5회 실패 | 해당 Agent가 자동 비활성화되고, 구독한 웹훅으로 `agent.auto_disabled` 이벤트가 발송되며, 대시보드에 배너가 표시됨 |
| **`assist`에서의 모든 실패** | 핸드오프 없이 조용히 스킵됨(제안만 안 뜸). 연속 실패 횟수에는 반영되지 않음 |
| 성공 응답 | 연속 실패 횟수가 0으로 리셋됨 |

**재시도는 하지 않습니다(v1).** 동일 메시지에 대해 여러분의 엔드포인트가 중복 호출되는
일이 없으므로, **에이전트 쪽에서 멱등성을 신경 쓸 필요가 없습니다.**

## 서명 검증 (에이전트 측 필수 구현)

모든 요청에는 `X-AideTalk-Timestamp`와 `X-AideTalk-Signature` 헤더가 실려 옵니다. 서명은
`timestamp + "." + raw_body`를 Agent secret으로 HMAC-SHA256 한 값(hex)입니다. 이 서명을
검증하지 않으면 누구나 여러분의 엔드포인트를 호출할 수 있으니 **반드시 구현하세요.**

### Node.js

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(req: { headers: Record<string, string>; rawBody: string }, secret: string) {
  const ts = req.headers["x-aidetalk-timestamp"];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // ±5분 이내만 허용(재전송 방지)

  const expected = createHmac("sha256", secret).update(`${ts}.${req.rawBody}`).digest("hex");
  const got = req.headers["x-aidetalk-signature"] ?? "";

  return expected.length === got.length && timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}
```

### Python

```python
import hmac, hashlib, time

def verify(headers: dict, raw_body: bytes, secret: str) -> bool:
    ts = headers.get("x-aidetalk-timestamp", "")
    if abs(time.time() - float(ts or 0)) > 300:
        return False  # ±5분 이내만 허용(재전송 방지)

    expected = hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, headers.get("x-aidetalk-signature", ""))
```

::: warning
`raw_body`는 프레임워크가 파싱하기 전의 원본 바이트여야 합니다. JSON을 파싱한 뒤 다시
`JSON.stringify`한 값으로 서명을 검증하면 키 순서/공백 차이로 서명이 어긋날 수 있습니다.
:::

## 연결 테스트

대시보드의 "연결 테스트" 버튼은 `message.text`가 `"__aidetalk_ping__"`인 요청을 실제로
여러분의 엔드포인트에 보냅니다. 여러분의 에이전트는 이 텍스트에 대해 임의의 유효한
`reply`를 반환하면 됩니다 — LLM을 호출하지 않고 고정 문자열로 응답하는 것을 권장합니다.

## 버저닝

- body의 `version` 필드로 관리합니다. 호환이 깨지는 변경은 버전을 올리고, 이전 버전을
  최소 6개월 병행 지원합니다.
- 필드 추가는 minor 변경으로 취급합니다 — **에이전트는 모르는 필드를 무시해야 합니다.**
  새 필드가 추가되어도 기존 에이전트가 깨지지 않도록 항상 관대하게 파싱하세요.

## 예제로 바로 시작하기

직접 구현하기 전에, 바로 실행 가능한 최소 예제 2종(Node/Hono, Python/FastAPI)을 준비해
두었습니다. [예제 에이전트 가이드](/guide/examples)를 참고하세요.

## v1.x 로드맵 (예고)

- SSE 스트리밍 응답 (`type: "stream"`)
- 에이전트 → AideTalk 능동 푸시 API
- `set_attributes` 액션 (방문자 속성 쓰기)

이 항목들은 아직 계약에 포함되지 않았습니다 — 현재 버전(v1)에서 구현할 필요는 없습니다.
