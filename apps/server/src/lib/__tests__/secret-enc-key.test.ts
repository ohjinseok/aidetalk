/**
 * SECRET_ENC_KEY 해석/검증 — 08_SECURITY.md §1.
 * env 검증(형식) + 폴백 경로(SESSION_SECRET 파생) + 부팅 경고 로그를 검증한다.
 */
import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { parseEnv, secretEncKeyByteLength } from "../../env";
import {
  isSecretEncKeyConfigured,
  resolveSecretEncKeyMaterial,
  warnIfSecretEncKeyMissing,
} from "../secret-enc-key";

const BASE_ENV = {
  DATABASE_URL: "postgres://localhost:5432/x",
  PUBSUB_DRIVER: "memory",
  SERVER_URL: "http://localhost:4000",
  DASHBOARD_URL: "http://localhost:3000",
  VISITOR_TOKEN_SECRET: "visitor_secret_at_least_16_chars",
  SESSION_SECRET: "session_secret_at_least_16_chars",
  LOG_LEVEL: "silent",
} as const;

describe("secretEncKeyByteLength", () => {
  it("64자 hex → 32바이트로 인식", () => {
    const hex = randomBytes(32).toString("hex");
    expect(secretEncKeyByteLength(hex)).toBe(32);
  });

  it("base64 32바이트 → 32바이트로 인식", () => {
    const b64 = randomBytes(32).toString("base64");
    expect(secretEncKeyByteLength(b64)).toBe(32);
  });

  it("base64url 32바이트 → 32바이트로 인식", () => {
    const b64url = randomBytes(32).toString("base64url");
    expect(secretEncKeyByteLength(b64url)).toBe(32);
  });

  it("16바이트만 표현하는 값은 32가 아니다", () => {
    const short = randomBytes(16).toString("hex");
    expect(secretEncKeyByteLength(short)).toBe(16);
  });
});

describe("env: SECRET_ENC_KEY 검증", () => {
  it("미설정이면 통과(옵션)", () => {
    const env = parseEnv({ ...BASE_ENV } as NodeJS.ProcessEnv);
    expect(env.SECRET_ENC_KEY).toBeUndefined();
  });

  it("32바이트 hex면 통과", () => {
    const key = randomBytes(32).toString("hex");
    const env = parseEnv({ ...BASE_ENV, SECRET_ENC_KEY: key } as NodeJS.ProcessEnv);
    expect(env.SECRET_ENC_KEY).toBe(key);
  });

  it("32바이트 base64면 통과", () => {
    const key = randomBytes(32).toString("base64");
    const env = parseEnv({ ...BASE_ENV, SECRET_ENC_KEY: key } as NodeJS.ProcessEnv);
    expect(env.SECRET_ENC_KEY).toBe(key);
  });

  it("길이가 32바이트가 아니면 검증 실패", () => {
    const shortKey = randomBytes(16).toString("hex");
    expect(() => parseEnv({ ...BASE_ENV, SECRET_ENC_KEY: shortKey } as NodeJS.ProcessEnv)).toThrow(
      /SECRET_ENC_KEY/,
    );
  });
});

describe("resolveSecretEncKeyMaterial / isSecretEncKeyConfigured", () => {
  it("SECRET_ENC_KEY가 있으면 그 값을 사용한다", () => {
    const env = { SECRET_ENC_KEY: "dedicated_key", SESSION_SECRET: "session_key" };
    expect(resolveSecretEncKeyMaterial(env)).toBe("dedicated_key");
    expect(isSecretEncKeyConfigured(env)).toBe(true);
  });

  it("SECRET_ENC_KEY가 없으면 SESSION_SECRET으로 폴백한다", () => {
    const env = { SECRET_ENC_KEY: undefined, SESSION_SECRET: "session_key" };
    expect(resolveSecretEncKeyMaterial(env)).toBe("session_key");
    expect(isSecretEncKeyConfigured(env)).toBe(false);
  });
});

describe("warnIfSecretEncKeyMissing", () => {
  it("미설정이면 경고 로그를 1회 남긴다", () => {
    const warn = vi.fn();
    warnIfSecretEncKeyMissing({ SECRET_ENC_KEY: undefined }, { warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/SECRET_ENC_KEY/);
  });

  it("설정되어 있으면 경고하지 않는다", () => {
    const warn = vi.fn();
    warnIfSecretEncKeyMissing({ SECRET_ENC_KEY: "dedicated_key" }, { warn });
    expect(warn).not.toHaveBeenCalled();
  });
});
