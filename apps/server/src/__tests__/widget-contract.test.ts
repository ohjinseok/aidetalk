/**
 * 위젯 REST 응답 ↔ shared 위젯 계약(widget-api.ts) 정합 검증.
 * 서버가 실제로 내려주는 응답이 위젯이 파싱하는 스키마를 그대로 통과하는지 확인한다.
 * (과거 "조용한 빈 목록 버그"류 스키마 드리프트를 런타임 계약으로 차단 — 커밋 27cae2a 참고)
 */
import {
  createConversationResponseSchema,
  messagesListSchema,
  postMessageResponseSchema,
  profileResponseSchema,
  sessionResponseSchema,
} from "@aidetalk/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHarness, http, type Harness } from "../../test/harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe("위젯 REST 응답이 shared 계약 스키마를 통과한다", () => {
  it("session → conversations → messages(GET/POST) → profile 전 응답이 계약 정합", async () => {
    const ws = await h.ctx.repos.workspace.create({
      name: "계약 테스트 워크스페이스",
      segment: "s1_site",
      widgetSettings: { greeting: "안녕하세요", primaryColor: "#123456" },
    });

    // POST /session
    const sessionRes = await http(h, "POST", "/v1/widget/session", {
      body: { workspaceId: ws.id },
    });
    expect(sessionRes.status).toBe(200);
    const session = sessionResponseSchema.parse(sessionRes.json);
    const token = session.visitorToken;

    // POST /conversations
    const convRes = await http(h, "POST", "/v1/widget/conversations", { token, body: {} });
    expect(convRes.status).toBe(201);
    const conv = createConversationResponseSchema.parse(convRes.json);
    const convId = conv.conversation.id;

    // POST /conversations/:id/messages (long-poll 폴백 전송)
    const sendRes = await http(h, "POST", `/v1/widget/conversations/${convId}/messages`, {
      token,
      body: { clientMsgId: "contract-1", text: "계약 검증 메시지" },
    });
    expect(sendRes.status).toBe(201);
    postMessageResponseSchema.parse(sendRes.json);

    // GET /conversations/:id/messages (빈 목록이 아닌 실제 목록도 봉투 계약 통과)
    const listRes = await http(h, "GET", `/v1/widget/conversations/${convId}/messages`, { token });
    expect(listRes.status).toBe(200);
    const list = messagesListSchema.parse(listRes.json);
    expect(list.items.length).toBeGreaterThan(0);

    // PATCH /profile
    const profileRes = await http(h, "PATCH", "/v1/widget/profile", {
      token,
      body: { name: "홍길동" },
    });
    expect(profileRes.status).toBe(200);
    profileResponseSchema.parse(profileRes.json);
  });
});
