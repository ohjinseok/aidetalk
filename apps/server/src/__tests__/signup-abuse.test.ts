/**
 * 회원가입 남용 방어 — 08 §3 / 04 §0.2.
 * 커버: 가입 레이트리밋(5/시간/IP), ALLOW_PUBLIC_SIGNUP 게이트(첫 유저 부트스트랩 / 초대 예외 / 차단).
 */
import { hashSecret } from "@aidetalk/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHarness, http, type Harness } from "../../test/harness";

/** 공개 가입 허용 인스턴스(레이트리밋 검증용). */
let open: Harness;
/** 공개 가입 차단 인스턴스(게이트 검증용) — 기본값과 동일한 설정. */
let closed: Harness;

beforeAll(async () => {
  open = await createHarness({ ALLOW_PUBLIC_SIGNUP: "true" });
  closed = await createHarness({ ALLOW_PUBLIC_SIGNUP: "false" });
});
afterAll(async () => {
  await open.close();
  await closed.close();
});

const rnd = () => Math.random().toString(36).slice(2);
const newEmail = () => `signup_${rnd()}@example.com`;
/** 테스트마다 다른 IP — 레이트리밋 버킷 격리(client-ip는 XFF 첫 값을 사용). */
const newIp = () => `203.0.113.${Math.floor(Math.random() * 254) + 1}`;

async function signup(h: Harness, email: string, ip: string) {
  return await http(h, "POST", "/v1/auth/signup", {
    body: { email, password: "password123", name: "신규" },
    headers: { "x-forwarded-for": ip },
  });
}

describe("가입 레이트리밋 (5/시간/IP)", () => {
  it("동일 IP 6번째 가입 시도는 429 rate/limited", async () => {
    const ip = newIp();
    for (let i = 0; i < 5; i++) {
      const res = await signup(open, newEmail(), ip);
      expect(res.status).toBe(201);
    }
    const over = await signup(open, newEmail(), ip);
    expect(over.status).toBe(429);
    expect(over.json.error.code).toBe("rate/limited");
  });

  it("다른 IP는 별도 버킷 — 영향 없음", async () => {
    const res = await signup(open, newEmail(), newIp());
    expect(res.status).toBe(201);
  });
});

describe("ALLOW_PUBLIC_SIGNUP=false 게이트", () => {
  it("유저가 이미 있으면 초대 없는 가입은 403 auth/forbidden", async () => {
    // 테스트 DB에는 다른 테스트가 만든 유저가 이미 존재한다(countAll > 0).
    await closed.ctx.repos.user.create({
      email: newEmail(),
      password: "password123",
      name: "기존",
    });

    const res = await signup(closed, newEmail(), newIp());
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("auth/forbidden");
  });

  it("유저가 0명인 신규 인스턴스는 첫 가입 허용(부트스트랩 잠김 방지)", async () => {
    // 통합 테스트 DB는 파일 간 공유라 실제로 비울 수 없다 → countAll만 "빈 인스턴스"로 대체한다.
    const repo = closed.ctx.repos.user;
    const original = repo.countAll;
    repo.countAll = async () => 0;
    try {
      const res = await signup(closed, newEmail(), newIp());
      expect(res.status).toBe(201);
    } finally {
      repo.countAll = original;
    }
  });

  it("유효한 초대를 받은 이메일은 가입 허용", async () => {
    const ws = await closed.ctx.repos.workspace.create({ name: "WS", segment: "s1_site" });
    const inviter = await closed.ctx.repos.user.create({
      email: newEmail(),
      password: "password123",
      name: "관리자",
    });
    const email = newEmail();
    await closed.ctx.repos.invite.create(ws.id, {
      email,
      role: "agent_member",
      tokenHash: hashSecret(`tok_${rnd()}`),
      invitedBy: inviter.id,
    });

    const res = await signup(closed, email, newIp());
    expect(res.status).toBe(201);
  });

  it("만료된 초대는 예외로 인정하지 않는다 — 403", async () => {
    const ws = await closed.ctx.repos.workspace.create({ name: "WS", segment: "s1_site" });
    const inviter = await closed.ctx.repos.user.create({
      email: newEmail(),
      password: "password123",
      name: "관리자",
    });
    const email = newEmail();
    await closed.ctx.repos.invite.create(ws.id, {
      email,
      role: "agent_member",
      tokenHash: hashSecret(`tok_${rnd()}`),
      invitedBy: inviter.id,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await signup(closed, email, newIp());
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("auth/forbidden");
  });
});

describe("ALLOW_PUBLIC_SIGNUP=true", () => {
  it("유저가 이미 있어도 초대 없이 계속 가입 가능", async () => {
    const res = await signup(open, newEmail(), newIp());
    expect(res.status).toBe(201);
  });
});
