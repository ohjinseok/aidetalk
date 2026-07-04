/**
 * 저장용 해시 유틸.
 * - agent/webhook secret: sha256(secret) 저장(03 §2). 원문은 저장/로그 금지(CLAUDE.md 규칙 5).
 * - password: argon2id(03 §2 users.passwordHash). pure-WASM(hash-wasm)이라 네이티브 빌드 불필요.
 */
import { createHash } from "node:crypto";

import { argon2id, argon2Verify } from "hash-wasm";

/** secret 원문 → sha256 hex. 커넥터/웹훅 시크릿 저장·비교에만 사용. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** 저장된 secretHash와 원문 secret이 일치하는지 상수시간에 준하는 비교(hex 동등). */
export function verifySecret(secret: string, storedHash: string): boolean {
  return hashSecret(secret) === storedHash;
}

/** 평문 비밀번호 → argon2id 인코딩 문자열(salt 포함). users.passwordHash에 저장. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 19456, // KiB (~19MB, OWASP argon2id 권장 하한)
    hashLength: 32,
    outputType: "encoded",
  });
}

/** 평문 비밀번호가 저장된 argon2id 해시와 일치하는지 검증. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return argon2Verify({ password, hash: storedHash });
}
