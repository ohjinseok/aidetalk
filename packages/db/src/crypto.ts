/**
 * 저장용 해시 유틸.
 * - agent/webhook secret: sha256(secret) 저장(03 §2). 원문은 저장/로그 금지(CLAUDE.md 규칙 5).
 * - password: argon2id(03 §2 users.passwordHash). pure-WASM(hash-wasm)이라 네이티브 빌드 불필요.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { argon2id, argon2Verify } from "hash-wasm";

/** secret 원문 → sha256 hex. 커넥터/웹훅 시크릿 저장·비교에만 사용. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** 키 문자열(예: SESSION_SECRET) → AES-256 키(32바이트). */
function deriveAesKey(keyMaterial: string): Buffer {
  return createHash("sha256").update(keyMaterial, "utf8").digest();
}

/**
 * 아웃바운드 서명용 secret 원문을 AES-256-GCM으로 암호화.
 * 반환 형식: `{iv}.{authTag}.{ciphertext}` (전부 base64url).
 * ⚠️ 원문은 절대 로그/응답에 남기지 않는다(규칙 5). DB에는 이 암호문만 보관.
 */
export function encryptSecret(plaintext: string, keyMaterial: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveAesKey(keyMaterial), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

/** encryptSecret로 만든 암호문을 복호화해 원문 secret을 반환. 형식 오류/변조 시 throw. */
export function decryptSecret(payload: string, keyMaterial: string): string {
  const [ivB, tagB, dataB] = payload.split(".");
  if (!ivB || !tagB || !dataB) throw new Error("secret 암호문 형식 오류");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveAesKey(keyMaterial),
    Buffer.from(ivB, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * 저장된 secretHash와 원문 secret이 일치하는지 timing-safe 비교(08 §1 "비교는 항상 timing-safe").
 * sha256 해시는 항상 32바이트 고정 길이이므로, 길이가 다르면(변조/오염된 storedHash) 비교 없이 false.
 * 길이 불일치 조기 반환은 storedHash(공격자가 제어할 수 없는 DB 값)의 형식 문제일 뿐이라 타이밍 누출로
 * 이어지지 않는다 — 공격자가 관찰 가능한 것은 비밀 secret 자체의 정오답 여부다.
 */
export function verifySecret(secret: string, storedHash: string): boolean {
  const computed = Buffer.from(hashSecret(secret), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
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
