/**
 * env 파싱 회귀 테스트 — 빈 문자열("") 정규화.
 * docker/.env.example은 선택 변수(EDITION, SECRET_ENC_KEY, SMTP_URL 등)를 값 없이
 * `KEY=` 형태로 비워두고, compose는 이를 빈 문자열로 컨테이너에 전달한다.
 * parseEnv가 빈 문자열을 undefined로 정규화하지 못하면 optional/default 필드에서
 * 검증 실패로 부팅이 중단된다 — 이 회귀를 막기 위한 테스트.
 */
import { describe, expect, it } from "vitest";

import { parseEnv } from "../env";

/** 필수 항목만 채운 최소 베이스(다른 필드는 각 테스트에서 덧붙인다). */
const REQUIRED_ONLY_ENV = {
  DATABASE_URL: "postgres://localhost:5432/aidetalk",
  SERVER_URL: "http://localhost",
  DASHBOARD_URL: "http://localhost",
  VISITOR_TOKEN_SECRET: "visitor_secret_at_least_16_chars",
  SESSION_SECRET: "session_secret_at_least_16_chars",
} as const;

describe("parseEnv: 빈 문자열 정규화", () => {
  it("docker/.env.example을 그대로 복사한 값 조합(선택 변수 전부 빈 문자열)이 파싱에 성공한다", () => {
    // compose.yml이 실제로 컨테이너에 주입하는 형태를 재현한다:
    // - PUBSUB_DRIVER=redis + REDIS_URL은 compose가 redis://redis:6379로 하드코딩.
    // - SERVER_URL/DASHBOARD_URL은 PUBLIC_URL 미설정 시 compose가 http://localhost로 치환.
    // - 나머지 선택 변수(EDITION, SECRET_ENC_KEY, SMTP_URL)는 .env.example에서 `KEY=`로 비어 있다.
    const exampleEnv = {
      ...REQUIRED_ONLY_ENV,
      REDIS_URL: "redis://redis:6379",
      PUBSUB_DRIVER: "redis",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_PATH: "/data/files",
      SECRET_ENC_KEY: "",
      EDITION: "",
      ALLOW_INSECURE_AGENT_ENDPOINT: "false",
      SMTP_URL: "",
      LOG_LEVEL: "info",
      TELEMETRY_ENABLED: "false",
      TELEMETRY_ENDPOINT: "https://telemetry.aidetalk.invalid/v1/ping",
    } as NodeJS.ProcessEnv;

    const env = parseEnv(exampleEnv);

    expect(env.EDITION).toBeUndefined();
    expect(env.SECRET_ENC_KEY).toBeUndefined();
    expect(env.SMTP_URL).toBeUndefined();
    expect(env.PUBSUB_DRIVER).toBe("redis");
    expect(env.REDIS_URL).toBe("redis://redis:6379");
  });

  it("optional 필드가 빈 문자열이면 undefined로 취급한다", () => {
    const env = parseEnv({
      ...REQUIRED_ONLY_ENV,
      EDITION: "",
      SECRET_ENC_KEY: "",
      SMTP_URL: "",
      REDIS_URL: "", // PUBSUB_DRIVER가 기본값(memory 아님, redis)이 아니라면 refine에 걸리지 않음
      PUBSUB_DRIVER: "memory",
    } as NodeJS.ProcessEnv);

    expect(env.EDITION).toBeUndefined();
    expect(env.SECRET_ENC_KEY).toBeUndefined();
    expect(env.SMTP_URL).toBeUndefined();
    expect(env.REDIS_URL).toBeUndefined();
  });

  it("default가 있는 필드가 빈 문자열이면 기본값이 적용된다", () => {
    const env = parseEnv({
      ...REQUIRED_ONLY_ENV,
      PUBSUB_DRIVER: "memory",
      STORAGE_DRIVER: "",
      STORAGE_LOCAL_PATH: "",
      LOG_LEVEL: "",
      PORT: "",
      TELEMETRY_ENDPOINT: "",
    } as NodeJS.ProcessEnv);

    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.STORAGE_LOCAL_PATH).toBe("/data/files");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.PORT).toBe(4000);
    expect(env.TELEMETRY_ENDPOINT).toBe("https://telemetry.aidetalk.invalid/v1/ping");
  });

  it("boolish 필드가 빈 문자열이면 기본값(false)이 적용된다", () => {
    const env = parseEnv({
      ...REQUIRED_ONLY_ENV,
      PUBSUB_DRIVER: "memory",
      ALLOW_INSECURE_AGENT_ENDPOINT: "",
      TELEMETRY_ENABLED: "",
      RUN_MIGRATIONS_ON_BOOT: "",
    } as NodeJS.ProcessEnv);

    expect(env.ALLOW_INSECURE_AGENT_ENDPOINT).toBe(false);
    expect(env.TELEMETRY_ENABLED).toBe(false);
    expect(env.RUN_MIGRATIONS_ON_BOOT).toBe(false);
  });

  it("필수 문자열 필드가 빈 문자열이면 정규화 후에도 명확한 '누락' 에러를 낸다", () => {
    expect(() =>
      parseEnv({ ...REQUIRED_ONLY_ENV, DATABASE_URL: "", PUBSUB_DRIVER: "memory" } as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL.*Postgres 연결 문자열이 필요하다/s);

    expect(() =>
      parseEnv({ ...REQUIRED_ONLY_ENV, SERVER_URL: "", PUBSUB_DRIVER: "memory" } as NodeJS.ProcessEnv),
    ).toThrow(/SERVER_URL/);
  });

  it("PUBSUB_DRIVER=redis + REDIS_URL 빈 문자열은 정규화 후에도 refine 실패를 유지한다", () => {
    expect(() =>
      parseEnv({
        ...REQUIRED_ONLY_ENV,
        PUBSUB_DRIVER: "redis",
        REDIS_URL: "",
      } as NodeJS.ProcessEnv),
    ).toThrow(/REDIS_URL/);
  });
});
