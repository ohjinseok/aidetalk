/**
 * 09_TESTING.md §4(권한 격리) — DELETE /v1/workspaces/:wsId/visitors/:visitorId/pii.
 * PII 파기(익명화)는 owner 전용. 비owner/타 워크스페이스/미인증은 차단, 성공 시 실제로 PII가 지워진다.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHarness, http, newUserWithWorkspace, type Harness } from "../../test/harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

/** 워크스페이스에 agent_member(비owner) 멤버 + 세션 쿠키 생성. */
async function newAgentMember(
  workspaceId: string,
): Promise<{ userId: string; cookie: string }> {
  const email = `a_${Math.random().toString(36).slice(2)}@example.com`;
  const user = await h.ctx.repos.user.create({ email, password: "password123", name: "상담원" });
  await h.ctx.repos.member.addActive(workspaceId, user.id, "agent_member");
  const sessionId = await h.ctx.sessionStore.create(user.id);
  return { userId: user.id, cookie: `od_session=${sessionId}` };
}

/** PII를 채운 방문자 1명을 워크스페이스에 만든다. */
async function seedVisitor(workspaceId: string): Promise<string> {
  const v = await h.ctx.repos.visitor.getOrCreateByToken(workspaceId, {});
  await h.ctx.repos.visitor.updateProfile(workspaceId, v.id, {
    email: "visitor@example.com",
    name: "홍길동",
    phone: "010-1234-5678",
    attributes: { 등급: "VIP" },
  });
  return v.id;
}

describe("DELETE /visitors/:visitorId/pii — 권한 격리 + 파기", () => {
  it("owner 호출 → 200 + PII가 실제로 익명화된다", async () => {
    const owner = await newUserWithWorkspace(h);
    const visitorId = await seedVisitor(owner.workspaceId);

    const res = await http(
      h,
      "DELETE",
      `/v1/workspaces/${owner.workspaceId}/visitors/${visitorId}/pii`,
      { cookie: owner.cookie },
    );
    expect(res.status).toBe(200);
    expect(res.json.visitorIds).toEqual([visitorId]);
    expect(Array.isArray(res.json.redactedConversationIds)).toBe(true);

    const anonymized = await h.ctx.repos.visitor.getById(owner.workspaceId, visitorId);
    expect(anonymized?.email).toBeNull();
    expect(anonymized?.name).toBeNull();
    expect(anonymized?.phone).toBeNull();
    expect(anonymized?.attributes).toEqual({});
  });

  it("agent(비owner) 멤버 호출 → 403, PII는 그대로", async () => {
    const owner = await newUserWithWorkspace(h);
    const visitorId = await seedVisitor(owner.workspaceId);
    const agent = await newAgentMember(owner.workspaceId);

    const res = await http(
      h,
      "DELETE",
      `/v1/workspaces/${owner.workspaceId}/visitors/${visitorId}/pii`,
      { cookie: agent.cookie },
    );
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("auth/forbidden");

    const still = await h.ctx.repos.visitor.getById(owner.workspaceId, visitorId);
    expect(still?.email).toBe("visitor@example.com");
  });

  it("타 워크스페이스 멤버 호출 → 403(교차 접근 불가), PII는 그대로", async () => {
    const a = await newUserWithWorkspace(h);
    const b = await newUserWithWorkspace(h);
    const visitorId = await seedVisitor(a.workspaceId);

    const res = await http(
      h,
      "DELETE",
      `/v1/workspaces/${a.workspaceId}/visitors/${visitorId}/pii`,
      { cookie: b.cookie },
    );
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("auth/forbidden");

    const still = await h.ctx.repos.visitor.getById(a.workspaceId, visitorId);
    expect(still?.email).toBe("visitor@example.com");
  });

  it("미인증(쿠키 없음) → 401", async () => {
    const owner = await newUserWithWorkspace(h);
    const visitorId = await seedVisitor(owner.workspaceId);

    const res = await http(
      h,
      "DELETE",
      `/v1/workspaces/${owner.workspaceId}/visitors/${visitorId}/pii`,
    );
    expect(res.status).toBe(401);
  });

  it("존재하지 않는 visitorId → 404", async () => {
    const owner = await newUserWithWorkspace(h);
    const res = await http(
      h,
      "DELETE",
      `/v1/workspaces/${owner.workspaceId}/visitors/vis_does_not_exist/pii`,
      { cookie: owner.cookie },
    );
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("not_found");
  });
});
