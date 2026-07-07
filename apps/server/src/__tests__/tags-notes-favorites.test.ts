/**
 * 인박스 태그/메모/즐겨찾기 통합 테스트 — 09_TESTING.md §4 권한 격리 커버.
 * 라우트: routes/workspaces/{tags,notes,inbox(favorite/tags 부착)}.ts.
 * 핵심 불변식: 워크스페이스 간 태그/메모/즐겨찾기는 교차 접근·부착이 전혀 불가능해야 한다
 * (CLAUDE.md 규칙 11 — 모든 repo 함수는 workspaceId로 격리).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createHarness,
  http,
  newConversation,
  newUserWithWorkspace,
  type Harness,
} from "../../test/harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

/** 기존 워크스페이스에 추가 멤버(기본 agent_member) 생성 — 세션 쿠키 반환. */
async function addMember(
  workspaceId: string,
  role: "owner" | "agent_member" = "agent_member",
): Promise<{ userId: string; cookie: string }> {
  const email = `m_${Math.random().toString(36).slice(2)}@example.com`;
  const user = await h.ctx.repos.user.create({ email, password: "password123", name: "멤버" });
  await h.ctx.repos.member.addActive(workspaceId, user.id, role);
  const sessionId = await h.ctx.sessionStore.create(user.id);
  return { userId: user.id, cookie: `od_session=${sessionId}` };
}

/** 기존 워크스페이스에 방문자 세션 발급. */
async function visitorSessionFor(
  workspaceId: string,
): Promise<{ token: string; visitorId: string }> {
  const res = await http(h, "POST", "/v1/widget/session", { body: { workspaceId } });
  return { token: res.json.visitorToken as string, visitorId: res.json.visitor.id as string };
}

// ================= 태그 CRUD + 워크스페이스 격리 =================
describe("태그 CRUD + 워크스페이스 격리", () => {
  it("생성/목록 해피패스, 타 워크스페이스 직접 접근 403, 교차 워크스페이스 tagId 참조 404", async () => {
    const a = await newUserWithWorkspace(h);
    const b = await newUserWithWorkspace(h);

    const created = await http(h, "POST", `/v1/workspaces/${a.workspaceId}/tags`, {
      cookie: a.cookie,
      body: { name: "VIP", color: "blue" },
    });
    expect(created.status).toBe(201);
    const tagId = created.json.tag.id as string;

    const list = await http(h, "GET", `/v1/workspaces/${a.workspaceId}/tags`, {
      cookie: a.cookie,
    });
    expect(list.json.items.some((t: { id: string }) => t.id === tagId)).toBe(true);

    // b가 a의 워크스페이스 경로를 직접 접근 → membership 검증에서 403.
    const listForbidden = await http(h, "GET", `/v1/workspaces/${a.workspaceId}/tags`, {
      cookie: b.cookie,
    });
    expect(listForbidden.status).toBe(403);
    const patchForbidden = await http(h, "PATCH", `/v1/workspaces/${a.workspaceId}/tags/${tagId}`, {
      cookie: b.cookie,
      body: { name: "탈취시도" },
    });
    expect(patchForbidden.status).toBe(403);
    const delForbidden = await http(h, "DELETE", `/v1/workspaces/${a.workspaceId}/tags/${tagId}`, {
      cookie: b.cookie,
    });
    expect(delForbidden.status).toBe(403);

    // b 소유 태그를 a가 "자기 워크스페이스 경로"로 조회/수정/삭제 시도 → repo가 not_found(404).
    const bTag = await http(h, "POST", `/v1/workspaces/${b.workspaceId}/tags`, {
      cookie: b.cookie,
      body: { name: "B전용" },
    });
    const crossPatch = await http(
      h,
      "PATCH",
      `/v1/workspaces/${a.workspaceId}/tags/${bTag.json.tag.id}`,
      { cookie: a.cookie, body: { name: "탈취시도2" } },
    );
    expect(crossPatch.status).toBe(404);
    const crossDelete = await http(
      h,
      "DELETE",
      `/v1/workspaces/${a.workspaceId}/tags/${bTag.json.tag.id}`,
      { cookie: a.cookie },
    );
    expect(crossDelete.status).toBe(404);
  });

  it("B의 tagId를 A의 대화에 부착 시도 → 404(교차 워크스페이스 차단)", async () => {
    const a = await newUserWithWorkspace(h);
    const b = await newUserWithWorkspace(h);
    const av = await visitorSessionFor(a.workspaceId);
    const convId = await newConversation(h, av.token);

    const bTag = await http(h, "POST", `/v1/workspaces/${b.workspaceId}/tags`, {
      cookie: b.cookie,
      body: { name: "B태그" },
    });

    const res = await http(
      h,
      "POST",
      `/v1/workspaces/${a.workspaceId}/conversations/${convId}/tags`,
      { cookie: a.cookie, body: { tagId: bTag.json.tag.id } },
    );
    expect(res.status).toBe(404);
  });

  // drizzle이 postgres.js 에러를 래핑해 unique_violation 코드가 err.cause.code에 실린다 —
  // repo는 _shared.ts isUniqueViolation으로 양쪽을 판별한다(과거 err.code만 봐서 500이 나던 회귀 방지).
  it("태그명 중복 생성 → 409 conflict", async () => {
    const a = await newUserWithWorkspace(h);
    await http(h, "POST", `/v1/workspaces/${a.workspaceId}/tags`, {
      cookie: a.cookie,
      body: { name: "재구매" },
    });
    const dup = await http(h, "POST", `/v1/workspaces/${a.workspaceId}/tags`, {
      cookie: a.cookie,
      body: { name: "재구매" },
    });
    expect(dup.status).toBe(409);
  });

  it("owner 삭제 → 부착된 대화의 tagIds에서 cascade 제거, agent_member 삭제 시도 → 403", async () => {
    const a = await newUserWithWorkspace(h);
    const member = await addMember(a.workspaceId);
    const av = await visitorSessionFor(a.workspaceId);
    const convId = await newConversation(h, av.token);

    const tag = await http(h, "POST", `/v1/workspaces/${a.workspaceId}/tags`, {
      cookie: a.cookie,
      body: { name: "환불요청" },
    });
    const tagId = tag.json.tag.id as string;
    await http(h, "POST", `/v1/workspaces/${a.workspaceId}/conversations/${convId}/tags`, {
      cookie: a.cookie,
      body: { tagId },
    });

    const forbidden = await http(h, "DELETE", `/v1/workspaces/${a.workspaceId}/tags/${tagId}`, {
      cookie: member.cookie,
    });
    expect(forbidden.status).toBe(403);

    const del = await http(h, "DELETE", `/v1/workspaces/${a.workspaceId}/tags/${tagId}`, {
      cookie: a.cookie,
    });
    expect(del.status).toBe(204);

    const tagIds = await h.ctx.repos.tag.listIdsByConversation(a.workspaceId, convId);
    expect(tagIds).not.toContain(tagId);
  });
});

// ================= 메모 CRUD + 권한 =================
describe("메모 CRUD + 권한", () => {
  it("작성자 아닌 멤버 PATCH → 403, 작성자/owner DELETE 허용, 제3자 DELETE → 403", async () => {
    const a = await newUserWithWorkspace(h); // owner
    const m1 = await addMember(a.workspaceId); // 작성자
    const m2 = await addMember(a.workspaceId); // 제3자
    const av = await visitorSessionFor(a.workspaceId);
    const convId = await newConversation(h, av.token);

    const created = await http(
      h,
      "POST",
      `/v1/workspaces/${a.workspaceId}/conversations/${convId}/notes`,
      { cookie: m1.cookie, body: { body: "환불 요청, 재확인 필요" } },
    );
    expect(created.status).toBe(201);
    expect(created.json.note.authorId).toBe(m1.userId);
    const noteId = created.json.note.id as string;

    // 비작성자(제3자) PATCH → 403.
    const patchForbidden = await http(h, "PATCH", `/v1/workspaces/${a.workspaceId}/notes/${noteId}`, {
      cookie: m2.cookie,
      body: { body: "수정시도" },
    });
    expect(patchForbidden.status).toBe(403);

    // 작성자 본인 PATCH → 200.
    const patchOk = await http(h, "PATCH", `/v1/workspaces/${a.workspaceId}/notes/${noteId}`, {
      cookie: m1.cookie,
      body: { body: "수정완료" },
    });
    expect(patchOk.status).toBe(200);
    expect(patchOk.json.note.body).toBe("수정완료");

    // 제3자 DELETE → 403.
    const delForbidden = await http(h, "DELETE", `/v1/workspaces/${a.workspaceId}/notes/${noteId}`, {
      cookie: m2.cookie,
    });
    expect(delForbidden.status).toBe(403);

    // owner DELETE → 204(작성자가 아니어도 owner는 삭제 가능).
    const delOwner = await http(h, "DELETE", `/v1/workspaces/${a.workspaceId}/notes/${noteId}`, {
      cookie: a.cookie,
    });
    expect(delOwner.status).toBe(204);

    // 작성자 본인 DELETE 허용 확인(별도 메모).
    const created2 = await http(
      h,
      "POST",
      `/v1/workspaces/${a.workspaceId}/conversations/${convId}/notes`,
      { cookie: m1.cookie, body: { body: "두번째 메모" } },
    );
    const delSelf = await http(
      h,
      "DELETE",
      `/v1/workspaces/${a.workspaceId}/notes/${created2.json.note.id}`,
      { cookie: m1.cookie },
    );
    expect(delSelf.status).toBe(204);
  });
});

// ================= 즐겨찾기 — 멱등 + 멤버별 독립 =================
describe("즐겨찾기 — 멱등 + 멤버별 독립", () => {
  it("PUT/DELETE 멱등, 멤버별 즐겨찾기 목록 독립", async () => {
    const a = await newUserWithWorkspace(h); // A1(owner)
    const a2 = await addMember(a.workspaceId); // A2
    const v1 = await visitorSessionFor(a.workspaceId);
    const v2 = await visitorSessionFor(a.workspaceId);
    const conv1 = await newConversation(h, v1.token);
    const conv2 = await newConversation(h, v2.token);

    const put1 = await http(
      h,
      "PUT",
      `/v1/workspaces/${a.workspaceId}/conversations/${conv1}/favorite`,
      { cookie: a.cookie },
    );
    expect(put1.status).toBe(200);
    expect(put1.json.favorite).toBe(true);
    // 멱등 — 다시 PUT해도 동일 결과.
    const put1Again = await http(
      h,
      "PUT",
      `/v1/workspaces/${a.workspaceId}/conversations/${conv1}/favorite`,
      { cookie: a.cookie },
    );
    expect(put1Again.json.favorite).toBe(true);

    const del1 = await http(
      h,
      "DELETE",
      `/v1/workspaces/${a.workspaceId}/conversations/${conv1}/favorite`,
      { cookie: a.cookie },
    );
    expect(del1.json.favorite).toBe(false);
    // 멱등 — 다시 DELETE해도 에러 없이 동일 결과.
    const del1Again = await http(
      h,
      "DELETE",
      `/v1/workspaces/${a.workspaceId}/conversations/${conv1}/favorite`,
      { cookie: a.cookie },
    );
    expect(del1Again.status).toBe(200);
    expect(del1Again.json.favorite).toBe(false);

    // A1은 conv1을, A2는 conv2를 즐겨찾기 — 서로의 목록에 안 보여야 한다.
    await http(h, "PUT", `/v1/workspaces/${a.workspaceId}/conversations/${conv1}/favorite`, {
      cookie: a.cookie,
    });
    await http(h, "PUT", `/v1/workspaces/${a.workspaceId}/conversations/${conv2}/favorite`, {
      cookie: a2.cookie,
    });

    const listA1 = await http(
      h,
      "GET",
      `/v1/workspaces/${a.workspaceId}/conversations?favorite=1`,
      { cookie: a.cookie },
    );
    const idsA1 = listA1.json.items.map((i: { conversation: { id: string } }) => i.conversation.id);
    expect(idsA1).toContain(conv1);
    expect(idsA1).not.toContain(conv2);

    const listA2 = await http(
      h,
      "GET",
      `/v1/workspaces/${a.workspaceId}/conversations?favorite=1`,
      { cookie: a2.cookie },
    );
    const idsA2 = listA2.json.items.map((i: { conversation: { id: string } }) => i.conversation.id);
    expect(idsA2).toContain(conv2);
    expect(idsA2).not.toContain(conv1);
  });
});

// ================= 타 워크스페이스 대화에 메모/즐겨찾기 =================
describe("타 워크스페이스 대화에 메모/즐겨찾기 → 404", () => {
  it("A의 워크스페이스 경로 + B의 conversationId → 404", async () => {
    const a = await newUserWithWorkspace(h);
    const b = await newUserWithWorkspace(h);
    const bv = await visitorSessionFor(b.workspaceId);
    const convB = await newConversation(h, bv.token);

    const noteRes = await http(
      h,
      "POST",
      `/v1/workspaces/${a.workspaceId}/conversations/${convB}/notes`,
      { cookie: a.cookie, body: { body: "시도" } },
    );
    expect(noteRes.status).toBe(404);

    const favRes = await http(
      h,
      "PUT",
      `/v1/workspaces/${a.workspaceId}/conversations/${convB}/favorite`,
      { cookie: a.cookie },
    );
    expect(favRes.status).toBe(404);
  });
});
