/**
 * 위젯 REST 클라이언트 — 04_API_SPEC.md §1.
 * 모든 응답은 shared/로컬 zod로 파싱해 계약을 강제한다.
 */
import {
  createConversationResponseSchema,
  messagesListSchema,
  postMessageResponseSchema,
  profileResponseSchema,
  sessionResponseSchema,
  type CreateConversationResponse,
  type MessagesList,
  type Message,
  type SessionResponse,
} from "../shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request(
  serverUrl: string,
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<unknown> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${serverUrl}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    mode: "cors",
  });
  if (!res.ok) {
    let code = "http_error";
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* 비-JSON 응답 무시 */
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function postSession(
  serverUrl: string,
  input: { workspaceId: string; existingToken?: string; pageUrl: string; referrer?: string },
): Promise<SessionResponse> {
  const data = await request(serverUrl, "/v1/widget/session", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      existingToken: input.existingToken,
      pageUrl: input.pageUrl,
      referrer: input.referrer,
    }),
  });
  return sessionResponseSchema.parse(data);
}

export async function postConversation(
  serverUrl: string,
  token: string,
  pageUrl: string,
): Promise<CreateConversationResponse> {
  const data = await request(serverUrl, "/v1/widget/conversations", {
    method: "POST",
    token,
    body: JSON.stringify({ pageUrl }),
  });
  return createConversationResponseSchema.parse(data);
}

export async function getMessages(
  serverUrl: string,
  token: string,
  conversationId: string,
  after?: string | null,
): Promise<MessagesList> {
  const qs = after ? `?after=${encodeURIComponent(after)}` : "";
  const data = await request(
    serverUrl,
    `/v1/widget/conversations/${conversationId}/messages${qs}`,
    { method: "GET", token },
  );
  return messagesListSchema.parse(data);
}

/** 폴백 전송 — WS 불가 시 REST로 message.send 동일 처리(04 §1). */
export async function postMessage(
  serverUrl: string,
  token: string,
  conversationId: string,
  clientMsgId: string,
  text: string,
): Promise<Message> {
  const data = await request(
    serverUrl,
    `/v1/widget/conversations/${conversationId}/messages`,
    { method: "POST", token, body: JSON.stringify({ clientMsgId, text }) },
  );
  return postMessageResponseSchema.parse(data).message;
}

export async function patchProfile(
  serverUrl: string,
  token: string,
  input: { email?: string; name?: string },
): Promise<{ visitorToken: string; visitor: SessionResponse["visitor"] }> {
  const data = await request(serverUrl, "/v1/widget/profile", {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
  return profileResponseSchema.parse(data);
}

export async function postHandoff(
  serverUrl: string,
  token: string,
  conversationId: string,
): Promise<void> {
  await request(serverUrl, "/v1/widget/handoff", {
    method: "POST",
    token,
    body: JSON.stringify({ conversationId }),
  });
}
