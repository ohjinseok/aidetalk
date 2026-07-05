/**
 * 미가입 이메일 멤버 초대 통합 — 04 §2 POST /members · POST /invites/accept.
 * 커버: 미가입 초대→가입→합류 / 만료 토큰 거부 / 재수락 거부 / 대상 이메일 격리 / 기가입 초대 흐름.
 */
import { hashSecret } from "@aidetalk/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHarness, http, newUserWithWorkspace, type Harness } from "../../test/harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const rnd = () => Math.random().toString(36).slice(2);

/** Set-Cookie에서 od_session 쿠키 문자열 추출. */
function cookieFrom(res: { headers: Headers }): string {
  const raw = res.headers.get("set-cookie") ?? "";
  const m = raw.match(/od_session=[^;]+/);
  if (!m) throw new Error("세션 쿠키 없음");
  return m[0];
}

function tokenFrom(inviteUrl: string): string {
  return new URL(inviteUrl).searchParams.get("token")!;
}

/** 가입 → 세션 쿠키 반환. */
async function signup(email: string): Promise<string> {
  const res = await http(h, "POST", "/v1/auth/signup", {
    body: { email, password: "password123", name: "신규" },
  });
  expect(res.status).toBe(201);
  return cookieFrom(res);
}

describe("미가입 이메일 초대 → 가입 → 합류", () => {
  it("invite 행 생성 → 가입 → 수락 → active 멤버", async () => {
    const owner = await newUserWithWorkspace(h);
    const email = `newbie_${rnd()}@example.com`;

    const invited = await http(h, "POST", `/v1/workspaces/${owner.workspaceId}/members`, {
      cookie: owner.cookie,
      body: { email, role: "agent_member" },
    });
    expect(invited.status).toBe(201);
    expect(invited.json.member).toBeNull(); // 미가입이라 member 없음
    expect(invited.json.invite.email).toBe(email);
    const token = tokenFrom(invited.json.inviteUrl);
    expect(invited.json.inviteUrl).toContain("/invites/accept?token=");

    const cookie = await signup(email);
    const accept = await http(h, "POST", "/v1/invites/accept", {
      cookie,
      body: { inviteToken: token },
    });
    expect(accept.status).toBe(200);
    expect(accept.json.member.workspaceId).toBe(owner.workspaceId);
    expect(accept.json.member.role).toBe("agent_member");
    expect(accept.json.member.status).toBe("active");

    // 목록에 활성 멤버로 노출.
    const members = await http(h, "GET", `/v1/workspaces/${owner.workspaceId}/members`, {
      cookie: owner.cookie,
    });
    expect(members.json.items.some((m: { email: string }) => m.email === email)).toBe(true);
  });

  it("재수락 거부(이미 수락된 초대) → 409", async () => {
    const owner = await newUserWithWorkspace(h);
    const email = `dup_${rnd()}@example.com`;
    const invited = await http(h, "POST", `/v1/workspaces/${owner.workspaceId}/members`, {
      cookie: owner.cookie,
      body: { email, role: "agent_member" },
    });
    const token = tokenFrom(invited.json.inviteUrl);
    const cookie = await signup(email);

    const first = await http(h, "POST", "/v1/invites/accept", {
      cookie,
      body: { inviteToken: token },
    });
    expect(first.status).toBe(200);

    const second = await http(h, "POST", "/v1/invites/accept", {
      cookie,
      body: { inviteToken: token },
    });
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe("conflict");
  });
});

describe("만료 토큰 거부", () => {
  it("expiresAt 과거인 초대 수락 → 404", async () => {
    const owner = await newUserWithWorkspace(h);
    const email = `expired_${rnd()}@example.com`;
    const rawToken = `raw_${rnd()}${rnd()}`;
    // 만료된 초대를 repo로 직접 생성.
    await h.ctx.repos.invite.create(owner.workspaceId, {
      email,
      role: "agent_member",
      tokenHash: hashSecret(rawToken),
      invitedBy: owner.userId,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const cookie = await signup(email);
    const accept = await http(h, "POST", "/v1/invites/accept", {
      cookie,
      body: { inviteToken: rawToken },
    });
    expect(accept.status).toBe(404);
    expect(accept.json.error.code).toBe("not_found");
  });
});

describe("대상 이메일 격리(타 워크스페이스/타 계정)", () => {
  it("초대 대상 이메일과 로그인 사용자가 다르면 403 + 합류 안 됨", async () => {
    const owner = await newUserWithWorkspace(h);
    const inviteEmail = `target_${rnd()}@example.com`;
    const invited = await http(h, "POST", `/v1/workspaces/${owner.workspaceId}/members`, {
      cookie: owner.cookie,
      body: { email: inviteEmail, role: "agent_member" },
    });
    const token = tokenFrom(invited.json.inviteUrl);

    // 다른 이메일의 사용자(다른 워크스페이스 소유)로 로그인해 토큰 수락 시도.
    const other = await newUserWithWorkspace(h);
    const attempt = await http(h, "POST", "/v1/invites/accept", {
      cookie: other.cookie,
      body: { inviteToken: token },
    });
    expect(attempt.status).toBe(403);
    expect(attempt.json.error.code).toBe("auth/forbidden");

    // other는 owner의 워크스페이스에 합류되지 않았다.
    const role = await h.ctx.repos.member.getRole(owner.workspaceId, other.userId);
    expect(role).toBeNull();
  });
});

describe("기가입 이메일 초대(기존 흐름 유지)", () => {
  it("가입 계정 초대 → member(invited) + inviteUrl → 수락 시 active", async () => {
    const owner = await newUserWithWorkspace(h);
    const existingEmail = `existing_${rnd()}@example.com`;
    const existingCookie = await signup(existingEmail);

    const invited = await http(h, "POST", `/v1/workspaces/${owner.workspaceId}/members`, {
      cookie: owner.cookie,
      body: { email: existingEmail, role: "agent_member" },
    });
    expect(invited.status).toBe(201);
    expect(invited.json.member.status).toBe("invited");
    const token = tokenFrom(invited.json.inviteUrl);

    const accept = await http(h, "POST", "/v1/invites/accept", {
      cookie: existingCookie,
      body: { inviteToken: token },
    });
    expect(accept.status).toBe(200);
    expect(accept.json.member.status).toBe("active");
    expect(accept.json.member.workspaceId).toBe(owner.workspaceId);
  });
});
