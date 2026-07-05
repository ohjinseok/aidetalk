/**
 * 09_TESTING.md §4 — repo 계층 소유 검증(멀티테넌트 격리) 회귀 테스트.
 * agentLog.append / assist.append가 크로스테넌트 삽입을 not_found로 차단하는지 확인한다.
 * (과거 agentLog.append는 소유검증 boolean을 버렸고 assist.append는 검증이 아예 없었다.)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createHarness,
  newConversation,
  newVisitorSession,
  registerMockAgent,
  type Harness,
} from "../../test/harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe("agentLog.append 소유 격리", () => {
  it("타 워크스페이스 agentId로 append → not_found, 소유 워크스페이스는 성공", async () => {
    const a = await newVisitorSession(h);
    const b = await newVisitorSession(h);
    const convA = await newConversation(h, a.token);
    const { agentId: agentA } = await registerMockAgent(h, a.workspaceId, "http://localhost:9/agent");

    const input = {
      agentId: agentA,
      conversationId: convA,
      mode: "reply" as const,
      requestSummary: { messageText: "안녕", historyCount: 0 },
      outcome: "reply" as const,
    };

    // 워크스페이스 B는 agentA를 소유하지 않는다 → 격리.
    await expect(h.ctx.repos.agentLog.append(b.workspaceId, input)).rejects.toMatchObject({
      code: "not_found",
    });

    // 소유 워크스페이스는 정상 기록.
    const row = await h.ctx.repos.agentLog.append(a.workspaceId, input);
    expect(row.agentId).toBe(agentA);
  });
});

describe("assist.append 소유 격리", () => {
  it("타 워크스페이스에서 다른 워크스페이스 대화로 append → not_found, 소유 워크스페이스는 성공", async () => {
    const a = await newVisitorSession(h);
    const b = await newVisitorSession(h);
    const convA = await newConversation(h, a.token);
    const msg = await h.ctx.repos.message.append(a.workspaceId, convA, {
      role: "visitor",
      authorId: a.visitorId,
      content: { type: "text", text: "재고 있나요" },
    });

    const input = {
      conversationId: convA,
      triggerMessageId: msg.id,
      draft: "재고 2개 남았어요",
    };

    // 워크스페이스 B는 convA를 소유하지 않는다 → 격리.
    await expect(h.ctx.repos.assist.append(b.workspaceId, input)).rejects.toMatchObject({
      code: "not_found",
    });

    // 소유 워크스페이스는 정상 생성.
    const row = await h.ctx.repos.assist.append(a.workspaceId, input);
    expect(row.conversationId).toBe(convA);
    expect(row.outcome).toBe("pending");
  });
});
