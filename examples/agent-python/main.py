"""AideTalk 예제 에이전트 (Python / FastAPI)

docs/05_AGENT_PROTOCOL.md 계약을 구현하는 최소 예제입니다.
- HMAC 서명 검증 (05 문서 Python 예시 그대로)
- mode=reply : FAQ(faq.md) 기반으로 답변하거나, 모르거나 환불/클레임이면 handoff
- mode=assist: 사람 상담원에게만 보이는 답변 초안 제안(suggest)
- message.text == "__aidetalk_ping__" : LLM 호출 없이 고정 응답 (연결 테스트용)

이 파일은 examples/ 하위이므로 LLM 호출 코드가 허용됩니다
(CLAUDE.md 절대 규칙 1의 예외). 코어(apps/, packages/)는 이런 코드를 가질 수 없습니다.

이 레포를 Claude Code에 열고 "우리 쇼핑몰 정책에 맞게 고쳐줘"라고 하면
faq.md와 아래 프롬프트를 실제 서비스에 맞게 바로 수정해 줍니다.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from typing import Any

import anthropic
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

BASE_DIR = Path(__file__).parent
FAQ_MARKDOWN = (BASE_DIR / "faq.md").read_text(encoding="utf-8")

AGENT_SHARED_SECRET = os.environ.get("AIDETALK_AGENT_SECRET", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
PING_TEXT = "__aidetalk_ping__"

client = anthropic.Anthropic()  # ANTHROPIC_API_KEY 환경변수를 사용한다
app = FastAPI()


# ---------- HMAC 서명 검증 — 05_AGENT_PROTOCOL.md Python 예시 그대로 ----------
def verify_signature(timestamp: str | None, raw_body: bytes, signature: str | None) -> bool:
    if not timestamp or not signature or not AGENT_SHARED_SECRET:
        return False
    try:
        if abs(time.time() - float(timestamp)) > 300:  # ±5분
            return False
    except ValueError:
        return False
    expected = hmac.new(
        AGENT_SHARED_SECRET.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def to_claude_messages(body: dict[str, Any]) -> list[dict[str, str]]:
    """05 문서 요청의 history + 현재 message를 Claude messages 형식으로 변환."""
    messages: list[dict[str, str]] = []
    for m in body.get("history", []):
        role = "user" if m.get("role") == "visitor" else "assistant"
        messages.append({"role": role, "content": m.get("text", "")})
    messages.append({"role": "user", "content": body["message"]["text"]})
    return messages


# ---------- mode=reply : FAQ 답변 또는 handoff을 Claude tool use로 판단시킨다 ----------
REPLY_SYSTEM_PROMPT = f"""당신은 한국 온라인 쇼핑몰의 CS 상담 AI입니다.
아래 FAQ 문서에 근거해 손님 질문에 친절하고 정확하게 답변하세요.

# 쇼핑몰 FAQ
{FAQ_MARKDOWN}

# 규칙
- FAQ에 근거해 답할 수 있는 질문은 reply_to_visitor 도구로 답하세요.
- FAQ로 답할 수 없거나, 환불/클레임/불만 접수처럼 사람이 직접 처리해야 하는 요청은
  반드시 handoff_to_human 도구를 사용하세요.
- 확신이 없으면 handoff_to_human을 사용하세요. FAQ에 없는 내용을 지어내지 마세요.
"""

REPLY_TOOLS: list[dict[str, Any]] = [
    {
        "name": "reply_to_visitor",
        "description": "FAQ에 근거해 손님에게 바로 답변할 수 있을 때 사용합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "손님에게 보낼 답변 (1~4000자)"},
                "quick_replies": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "선택 가능한 빠른 답장 버튼 (최대 5개)",
                },
            },
            "required": ["text"],
        },
    },
    {
        "name": "handoff_to_human",
        "description": "환불/클레임/불만이거나 FAQ로 답할 수 없어 사람 상담원이 필요할 때 사용합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "상담원에게 보여줄 handoff 사유"},
                "summary": {"type": "string", "description": "대화 요약 (선택)"},
                "message_to_visitor": {
                    "type": "string",
                    "description": "손님에게 보여줄 안내 문구 (선택)",
                },
            },
            "required": ["reason"],
        },
    },
]


def handle_reply(body: dict[str, Any]) -> dict[str, Any]:
    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=1024,
        system=REPLY_SYSTEM_PROMPT,
        tools=REPLY_TOOLS,
        tool_choice={"type": "any"},  # 두 도구 중 하나는 반드시 호출하도록 강제
        messages=to_claude_messages(body),
    )

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        # 모델이 도구를 호출하지 않은 예외 상황 — 안전하게 상담원에게 넘긴다
        return {"type": "handoff", "reason": "AI가 답변 형식을 반환하지 않았습니다."}

    data: dict[str, Any] = tool_use.input  # type: ignore[assignment]
    if tool_use.name == "handoff_to_human":
        return {
            "type": "handoff",
            "reason": data.get("reason", "상담원 확인이 필요합니다."),
            "summary": data.get("summary"),
            "message_to_visitor": data.get("message_to_visitor"),
        }

    return {
        "type": "reply",
        "text": data.get("text", ""),
        "quick_replies": data.get("quick_replies"),
    }


# ---------- mode=assist : 상담원 전용 답변 초안 제안 ----------
ASSIST_SYSTEM_PROMPT = f"""당신은 한국 온라인 쇼핑몰 CS 상담원을 돕는 AI 어시스턴트입니다.
아래 FAQ와 대화 맥락을 참고해 상담원이 바로 보낼 수 있는 답변 초안을 제안하세요.
이 제안은 상담원에게만 보이고 손님에게 직접 전송되지 않습니다.

# 쇼핑몰 FAQ
{FAQ_MARKDOWN}

제안할 내용이 없으면 no_suggestion 도구를 사용하세요.
"""

ASSIST_TOOLS: list[dict[str, Any]] = [
    {
        "name": "suggest_reply",
        "description": "상담원에게 답변 초안을 제안합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "draft": {"type": "string", "description": "상담원이 바로 보낼 수 있는 답변 초안"},
                "rationale": {"type": "string", "description": "이 답변을 제안하는 이유 (선택)"},
            },
            "required": ["draft"],
        },
    },
    {
        "name": "no_suggestion",
        "description": "제안할 내용이 없을 때 사용합니다.",
        "input_schema": {"type": "object", "properties": {}},
    },
]


def handle_assist(body: dict[str, Any]) -> dict[str, Any]:
    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=512,
        system=ASSIST_SYSTEM_PROMPT,
        tools=ASSIST_TOOLS,
        tool_choice={"type": "any"},
        messages=to_claude_messages(body),
    )

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None or tool_use.name == "no_suggestion":
        return {"type": "noop"}

    data: dict[str, Any] = tool_use.input  # type: ignore[assignment]
    return {"type": "suggest", "draft": data.get("draft", ""), "rationale": data.get("rationale")}


# ---------- HTTP 서버 ----------
@app.get("/")
async def health() -> str:
    return "AideTalk agent-python 예제가 실행 중입니다. POST로 요청하세요."


@app.post("/")
async def handle(request: Request):
    raw_body = await request.body()
    timestamp = request.headers.get("x-aidetalk-timestamp")
    signature = request.headers.get("x-aidetalk-signature")

    if not verify_signature(timestamp, raw_body, signature):
        return JSONResponse({"error": "invalid signature"}, status_code=401)

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return {"type": "noop"}

    # 연결 테스트: LLM 호출 없이 즉시 고정 reply 반환
    if body.get("message", {}).get("text") == PING_TEXT:
        return {"type": "reply", "text": "정상적으로 연결되었습니다. (agent-python 예제)"}

    mode = body.get("mode")
    try:
        if mode == "assist":
            return handle_assist(body)
        return handle_reply(body)
    except Exception as exc:  # noqa: BLE001 - 예제이므로 광범위 캐치 후 안전 처리
        print(f"[agent-python] 처리 실패: {exc}")
        # assist 실패는 조용히 스킵, reply 실패는 AideTalk가 자동 handoff 처리 (05 문서 §에러 처리)
        if mode == "assist":
            return {"type": "noop"}
        return JSONResponse({"type": "noop"}, status_code=500)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8787)))
