# Agent Protocol (v1)

This is the HTTP contract between AideTalk and your AI Agent. Any HTTP server that
follows this contract can connect to AideTalk, regardless of language or framework.
LLM calls, tool use, and business logic are entirely up to your agent — AideTalk
only relays the request and validates the response; it never cares which model
you use.

This document stays in sync with the schema that the AideTalk server actually
validates against. When the version changes, it follows the
[versioning](#versioning) rules below.

::: tip Notation
This contract is language-neutral, so it uses **snake_case** throughout — as
opposed to the camelCase used by AideTalk's dashboard/internal APIs.
:::

## Overview

```
AideTalk ──POST──▶ your endpoint
         ◀─JSON── reply / handoff / noop   (mode=reply: response sent to the visitor)
         ◀─JSON── suggest / noop           (mode=assist: suggestion visible to the agent only)
```

- `mode: "reply"` — the result is **delivered to the visitor**. Called every time
  the visitor sends a message while the conversation is in AI mode.
- `mode: "assist"` — called every time the visitor sends a message while the
  conversation is being handled by a human agent. The result is shown **only to
  the human agent**. You don't need to implement this — returning
  `{ "type": "noop" }` behaves exactly like having assist disabled.

## Request (AideTalk → Agent)

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
    "text": "When will my order arrive?",
    "created_at": "2026-06-12T09:00:00Z"
  },
  "history": [
    // Last 20 messages, oldest first. Does not include the current message.
    // role: visitor|agent_ai|agent_human|system
    { "id": "msg_000", "role": "agent_ai", "text": "Hi! How can I help you today?", "created_at": "..." }
  ],
  "visitor": {
    "id": "vis_xyz",
    "email": "kim@example.com",           // may be null
    "name": null,
    "attributes": { "order_id": "ORD-123" },
    "page_url": "https://shop.com/orders"
  },
  "workspace": {
    "id": "ws_1",
    "metadata": {}                        // arbitrary values you defined in workspace settings
  }
}
```

## Response (Agent → AideTalk)

Return one of the following within the timeout (default 30 seconds, configurable
per workspace).

### 1) reply — a response to send to the visitor (mode=reply only)

```jsonc
{
  "type": "reply",
  "text": "Order ORD-123 is expected to arrive tomorrow (6/13).",   // 1-4000 chars
  "quick_replies": ["Something else", "Talk to a human"],          // optional, max 5, 40 chars each
  "typing_delay_ms": 600,                                          // optional, 0-3000. Typing indicator delay before sending
  "track_links": true                                              // optional, default true. Auto-tags URLs in text for conversion tracking
}
```

- With `track_links: true`, AideTalk appends a `?at_l=...` parameter to URLs in
  `text` and tracks whether they're clicked. You just need to include plain
  links — see the
  [tracking section of the Widget Embed Guide](/guide/widget-embed#트래킹-파라미터-at-l)
  for details (Korean page — an English version is coming soon).
- If the visitor taps a quick reply matching "Talk to a human" (matching the
  widget's i18n string), the widget automatically sends a handoff request.

### 2) handoff — hand the conversation to a human (mode=reply only)

```jsonc
{
  "type": "handoff",
  "reason": "Refund request",                                    // required, shown to the human agent
  "summary": "Simple-change-of-mind refund for order ORD-123, paid by card.", // optional, summary for the agent
  "message_to_visitor": "Let me connect you with a team member. One moment!"  // optional, overrides the default message
}
```

### 3) noop — stay silent

```jsonc
{ "type": "noop" }
```

Use this when there's nothing to say — e.g. the visitor just sent "thanks!" — or
when there's nothing worth suggesting in assist mode.

### 4) suggest — a suggestion for the human agent (mode=assist only)

```jsonc
{
  "type": "suggest",
  "draft": "We currently have 2 left in stock! Order today and it'll arrive tomorrow :)",
  "rationale": "A delivery-date question signals purchase intent. Recommend emphasizing scarcity + fast shipping.", // optional
  "actions": [ { "label": "Send restock notification link", "url": "https://shop.com/notify/123" } ]  // optional, max 3
}
```

**This is never sent to the visitor.** It's shown only in the human agent's
inbox side panel, and whether the agent adopts, edits, or ignores it is
recorded to measure suggestion quality.

### Invalid combinations

Sending a `suggest` response for `mode=reply`, or a `reply`/`handoff` response
for `mode=assist`, is treated as a schema mismatch and follows the error
handling table below.

## Error handling

How AideTalk reacts to the outcome of calling your endpoint.

| Situation | AideTalk's behavior |
|---|---|
| Timeout / 5xx / connection failure / schema mismatch / empty body / response over 64KB | (for `mode=reply`) Automatically hands off to a human agent and shows the visitor a default message. A failure is logged and the consecutive-failure count is incremented |
| 5 consecutive failures on `reply` | The Agent is automatically disabled, a subscribed webhook receives an `agent.auto_disabled` event, and a banner appears on the dashboard |
| **Any failure in `assist`** | Silently skipped, no handoff (the suggestion simply doesn't appear). Does not count toward the consecutive-failure total |
| Successful response | Consecutive-failure count resets to 0 |

**There are no retries (v1).** Your endpoint is never called twice for the same
message, so **your agent doesn't need to worry about idempotency.**

## Signature verification (required on the agent side)

Every request carries `X-AideTalk-Timestamp` and `X-AideTalk-Signature` headers.
The signature is an HMAC-SHA256 (hex) of `timestamp + "." + raw_body`, keyed with
your Agent secret. If you don't verify this, anyone could call your endpoint —
**make sure to implement it.**

### Node.js

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(req: { headers: Record<string, string>; rawBody: string }, secret: string) {
  const ts = req.headers["x-aidetalk-timestamp"];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // allow only within ±5 minutes (replay protection)

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
        return False  # allow only within ±5 minutes (replay protection)

    expected = hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, headers.get("x-aidetalk-signature", ""))
```

::: warning
`raw_body` must be the original bytes, before your framework parses them. If you
verify against a re-serialized (`JSON.stringify`'d) version of the parsed body,
key ordering or whitespace differences can make the signature mismatch.
:::

## Connection test

The dashboard's "Test connection" button sends a real request with
`message.text` set to `"__aidetalk_ping__"`. Your agent should return any valid
`reply` for this text — we recommend responding with a fixed string without
calling an LLM.

## Versioning

- Managed via the `version` field in the body. Breaking changes bump the
  version, with the previous version supported in parallel for at least 6 months.
- Adding fields is a minor change — **your agent must ignore fields it doesn't
  recognize.** Always parse leniently so new fields don't break your integration.

## Start from an example

You don't have to implement this from scratch. Two ready-to-run minimal examples
(Node/Hono and Python/FastAPI) are available — see the
[Example Agents guide](/guide/examples) (Korean page — an English version is
coming soon).

## v1.x roadmap (preview)

- SSE streaming responses (`type: "stream"`)
- An active push API from your agent to AideTalk
- A `set_attributes` action (writing visitor attributes)

None of these are part of the contract yet — you don't need to implement them
for the current version (v1).
