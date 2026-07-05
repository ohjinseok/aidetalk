/**
 * 08_SECURITY.md §6 남은 리스크 1 / 03_DATA_MODEL.md §0 — visitorRepo.hardDeletePii.
 * "hard delete"라는 이름이지만 실제로는 **익명화**다: FK 연쇄로 대화 이력 자체가 사라지면
 * 상담 기록 감사가 불가능해지므로, conversations/messages 행은 보존하고 visitor의 PII 필드와
 * 방문자가 작성한 메시지 본문만 지운다. mergedInto 체인(이메일 병합 클러스터)도 함께 처리한다.
 */
import { t } from "@aidetalk/i18n";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sendVisitorMessage } from "../services/messaging";
import { createHarness, newConversation, newVisitorSession, type Harness } from "../../test/harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe("visitorRepo.hardDeletePii", () => {
  it("visitor PII를 null/{}로 익명화하고 방문자 메시지만 치환한다(대화·메시지 행/상담원 메시지는 보존)", async () => {
    const s = await newVisitorSession(h);
    await h.ctx.repos.visitor.updateProfile(s.workspaceId, s.visitorId, {
      email: "visitor@example.com",
      name: "홍길동",
      phone: "010-1234-5678",
      attributes: { 등급: "VIP" },
    });
    const convId = await newConversation(h, s.token);
    const visitor = { visitorId: s.visitorId, workspaceId: s.workspaceId };
    await sendVisitorMessage(h.ctx, {
      visitor,
      conversationId: convId,
      clientMsgId: "m1",
      text: "제 전화번호는 010-1234-5678 이에요",
    });
    await h.ctx.repos.message.append(s.workspaceId, convId, {
      role: "agent_ai",
      authorId: "agt_test",
      content: { type: "text", text: "안녕하세요, 무엇을 도와드릴까요?" },
    });

    const result = await h.ctx.repos.visitor.hardDeletePii(s.workspaceId, s.visitorId);
    expect(result?.visitorIds).toEqual([s.visitorId]);
    expect(result?.redactedConversationIds).toEqual([convId]);

    const anonymized = await h.ctx.repos.visitor.getById(s.workspaceId, s.visitorId);
    expect(anonymized?.email).toBeNull();
    expect(anonymized?.name).toBeNull();
    expect(anonymized?.phone).toBeNull();
    expect(anonymized?.attributes).toEqual({});

    // 대화/메시지 행 자체는 삭제되지 않는다(감사 이력 보존).
    const listed = await h.ctx.repos.message.listRecent(s.workspaceId, convId, 10);
    expect(listed).toHaveLength(2);
    const visitorMsg = listed.find((m) => m.role === "visitor");
    expect(visitorMsg?.content).toEqual({ type: "text", text: t("server.messageRedacted") });
    const agentMsg = listed.find((m) => m.role === "agent_ai");
    expect(agentMsg?.content).toEqual({ type: "text", text: "안녕하세요, 무엇을 도와드릴까요?" });
  });

  it("존재하지 않는 visitor는 undefined를 반환하고 아무 것도 바꾸지 않는다", async () => {
    const result = await h.ctx.repos.visitor.hardDeletePii("ws_not_exist", "vis_not_exist");
    expect(result).toBeUndefined();
  });

  it("mergedInto 체인(이메일 병합 클러스터) 전체를 함께 익명화한다 — 자식 visitor로 요청해도 canonical까지 처리", async () => {
    const ws = await h.ctx.repos.workspace.create({ name: "병합 테스트", segment: "s1_site" });
    const canonical = await h.ctx.repos.visitor.getOrCreateByToken(ws.id, {});
    const dup = await h.ctx.repos.visitor.getOrCreateByToken(ws.id, {});
    await h.ctx.repos.visitor.updateProfile(ws.id, canonical.id, { email: "dup@example.com" });
    await h.ctx.repos.visitor.updateProfile(ws.id, dup.id, { email: "dup@example.com" });
    const merged = await h.ctx.repos.visitor.mergeByEmail(ws.id, "dup@example.com", dup.id);
    expect(merged?.mergedInto).toBe(canonical.id);

    const convA = await h.ctx.repos.conversation.create(ws.id, { visitorId: canonical.id });
    const convB = await h.ctx.repos.conversation.create(ws.id, { visitorId: dup.id });
    await h.ctx.repos.message.append(ws.id, convA.id, {
      role: "visitor",
      authorId: canonical.id,
      content: { type: "text", text: "canonical의 메시지" },
    });
    await h.ctx.repos.message.append(ws.id, convB.id, {
      role: "visitor",
      authorId: dup.id,
      content: { type: "text", text: "dup의 메시지" },
    });

    // 자식(dup)의 visitorId로 요청해도 canonical까지 클러스터 전체가 처리되어야 한다.
    const result = await h.ctx.repos.visitor.hardDeletePii(ws.id, dup.id);
    expect(new Set(result?.visitorIds)).toEqual(new Set([canonical.id, dup.id]));
    expect(new Set(result?.redactedConversationIds)).toEqual(new Set([convA.id, convB.id]));

    const canonicalRow = await h.ctx.repos.visitor.getById(ws.id, canonical.id);
    expect(canonicalRow?.email).toBeNull();
    const dupRow = await h.ctx.repos.visitor.getById(ws.id, dup.id);
    expect(dupRow?.email).toBeNull();

    const aMsgs = await h.ctx.repos.message.listRecent(ws.id, convA.id, 10);
    expect(aMsgs[0]?.content).toEqual({ type: "text", text: t("server.messageRedacted") });
    const bMsgs = await h.ctx.repos.message.listRecent(ws.id, convB.id, 10);
    expect(bMsgs[0]?.content).toEqual({ type: "text", text: t("server.messageRedacted") });
  });
});
