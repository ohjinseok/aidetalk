/**
 * AideTalk 예제 에이전트 (Node / Hono)
 *
 * docs/05_AGENT_PROTOCOL.md 계약을 구현하는 최소 예제입니다.
 * - HMAC 서명 검증 (05 문서 Node 예시 그대로)
 * - mode=reply : FAQ(faq.md) 기반으로 답변하거나, 모르거나 환불/클레임이면 handoff
 * - mode=assist: 사람 상담원에게만 보이는 답변 초안 제안(suggest)
 * - message.text === "__aidetalk_ping__" : LLM 호출 없이 고정 응답 (연결 테스트용)
 *
 * ⚠️ 이 파일은 examples/ 하위이므로 LLM 호출 코드가 허용됩니다
 *    (CLAUDE.md 절대 규칙 1의 예외). 코어(apps/, packages/)는 이런 코드를 가질 수 없습니다.
 *
 * 이 레포를 Claude Code에 열고 "우리 쇼핑몰 정책에 맞게 고쳐줘"라고 하면
 * faq.md와 아래 프롬프트를 실제 서비스에 맞게 바로 수정해 줍니다.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

// ESM에는 __dirname이 없으므로 import.meta.url로 계산한다.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FAQ_MARKDOWN = readFileSync(join(__dirname, "faq.md"), "utf-8");

const AGENT_SHARED_SECRET = process.env.AIDETALK_AGENT_SECRET ?? "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const PORT = Number(process.env.PORT ?? 8787);
const PING_TEXT = "__aidetalk_ping__";

const anthropic = new Anthropic(); // ANTHROPIC_API_KEY 환경변수를 사용한다

// ---------- HMAC 서명 검증 — 05_AGENT_PROTOCOL.md Node 예시 그대로 ----------
function verifySignature(
  timestamp: string | undefined,
  rawBody: string,
  signature: string | undefined,
): boolean {
  if (!timestamp || !signature || !AGENT_SHARED_SECRET) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // ±5분
  const expected = createHmac("sha256", AGENT_SHARED_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ---------- 05 문서 요청 계약 (최소 타입 — packages/shared는 외부 유저 예제이므로 import하지 않는다) ----------
interface AgentMessage {
  id: string;
  role: "visitor" | "agent_ai" | "agent_human" | "system";
  text: string;
  created_at: string;
}

interface AgentRequestBody {
  version: "1";
  mode: "reply" | "assist";
  conversation_id: string;
  message: AgentMessage;
  history: AgentMessage[];
  visitor: {
    id: string;
    email: string | null;
    name: string | null;
    attributes: Record<string, unknown>;
    page_url: string;
  };
  workspace: { id: string; metadata: Record<string, unknown> };
}

function toClaudeMessages(body: AgentRequestBody): Anthropic.MessageParam[] {
  return [
    ...body.history.map((m) => ({
      role: (m.role === "visitor" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    })),
    { role: "user" as const, content: body.message.text },
  ];
}

// ---------- mode=reply : FAQ 답변 또는 handoff을 Claude tool use로 판단시킨다 ----------
const REPLY_SYSTEM_PROMPT = `당신은 한국 온라인 쇼핑몰의 CS 상담 AI입니다.
아래 FAQ 문서에 근거해 손님 질문에 친절하고 정확하게 답변하세요.

# 쇼핑몰 FAQ
${FAQ_MARKDOWN}

# 규칙
- FAQ에 근거해 답할 수 있는 질문은 reply_to_visitor 도구로 답하세요.
- FAQ로 답할 수 없거나, 환불/클레임/불만 접수처럼 사람이 직접 처리해야 하는 요청은
  반드시 handoff_to_human 도구를 사용하세요.
- 확신이 없으면 handoff_to_human을 사용하세요. FAQ에 없는 내용을 지어내지 마세요.`;

const REPLY_TOOLS: Anthropic.Tool[] = [
  {
    name: "reply_to_visitor",
    description: "FAQ에 근거해 손님에게 바로 답변할 수 있을 때 사용합니다.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "손님에게 보낼 답변 (1~4000자)" },
        quick_replies: {
          type: "array",
          items: { type: "string" },
          description: "선택 가능한 빠른 답장 버튼 (최대 5개)",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "handoff_to_human",
    description:
      "환불/클레임/불만이거나 FAQ로 답할 수 없어 사람 상담원이 필요할 때 사용합니다.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "상담원에게 보여줄 handoff 사유" },
        summary: { type: "string", description: "대화 요약 (선택)" },
        message_to_visitor: {
          type: "string",
          description: "손님에게 보여줄 안내 문구 (선택)",
        },
      },
      required: ["reason"],
    },
  },
];

async function handleReply(body: AgentRequestBody) {
  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: REPLY_SYSTEM_PROMPT,
    tools: REPLY_TOOLS,
    tool_choice: { type: "any" }, // 두 도구 중 하나는 반드시 호출하도록 강제
    messages: toClaudeMessages(body),
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    // 모델이 도구를 호출하지 않은 예외 상황 — 안전하게 상담원에게 넘긴다
    return { type: "handoff" as const, reason: "AI가 답변 형식을 반환하지 않았습니다." };
  }

  const input = toolUse.input as Record<string, unknown>;
  if (toolUse.name === "handoff_to_human") {
    return {
      type: "handoff" as const,
      reason: (input.reason as string) ?? "상담원 확인이 필요합니다.",
      summary: input.summary as string | undefined,
      message_to_visitor: input.message_to_visitor as string | undefined,
    };
  }

  return {
    type: "reply" as const,
    text: input.text as string,
    quick_replies: input.quick_replies as string[] | undefined,
  };
}

// ---------- mode=assist : 상담원 전용 답변 초안 제안 ----------
const ASSIST_SYSTEM_PROMPT = `당신은 한국 온라인 쇼핑몰 CS 상담원을 돕는 AI 어시스턴트입니다.
아래 FAQ와 대화 맥락을 참고해 상담원이 바로 보낼 수 있는 답변 초안을 제안하세요.
이 제안은 상담원에게만 보이고 손님에게 직접 전송되지 않습니다.

# 쇼핑몰 FAQ
${FAQ_MARKDOWN}

제안할 내용이 없으면 no_suggestion 도구를 사용하세요.`;

const ASSIST_TOOLS: Anthropic.Tool[] = [
  {
    name: "suggest_reply",
    description: "상담원에게 답변 초안을 제안합니다.",
    input_schema: {
      type: "object",
      properties: {
        draft: { type: "string", description: "상담원이 바로 보낼 수 있는 답변 초안" },
        rationale: { type: "string", description: "이 답변을 제안하는 이유 (선택)" },
      },
      required: ["draft"],
    },
  },
  {
    name: "no_suggestion",
    description: "제안할 내용이 없을 때 사용합니다.",
    input_schema: { type: "object", properties: {} },
  },
];

async function handleAssist(body: AgentRequestBody) {
  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 512,
    system: ASSIST_SYSTEM_PROMPT,
    tools: ASSIST_TOOLS,
    tool_choice: { type: "any" },
    messages: toClaudeMessages(body),
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse || toolUse.name === "no_suggestion") {
    return { type: "noop" as const };
  }

  const input = toolUse.input as Record<string, unknown>;
  return {
    type: "suggest" as const,
    draft: input.draft as string,
    rationale: input.rationale as string | undefined,
  };
}

// ---------- HTTP 서버 ----------
const app = new Hono();

app.post("/", async (c) => {
  const rawBody = await c.req.text();
  const timestamp = c.req.header("x-aidetalk-timestamp");
  const signature = c.req.header("x-aidetalk-signature");

  if (!verifySignature(timestamp, rawBody, signature)) {
    return c.json({ error: "invalid signature" }, 401);
  }

  let body: AgentRequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ type: "noop" });
  }

  // 연결 테스트: LLM 호출 없이 즉시 고정 reply 반환
  if (body.message?.text === PING_TEXT) {
    return c.json({ type: "reply", text: "정상적으로 연결되었습니다. (agent-node 예제)" });
  }

  try {
    if (body.mode === "assist") {
      return c.json(await handleAssist(body));
    }
    return c.json(await handleReply(body));
  } catch (err) {
    console.error("[agent-node] 처리 실패:", err);
    // assist 실패는 조용히 스킵, reply 실패는 AideTalk가 자동 handoff 처리 (05 문서 §에러 처리)
    if (body.mode === "assist") return c.json({ type: "noop" });
    return c.json({ type: "noop" }, 500);
  }
});

app.get("/", (c) => c.text("AideTalk agent-node 예제가 실행 중입니다. POST로 요청하세요."));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[agent-node] listening on http://localhost:${info.port}`);
});
