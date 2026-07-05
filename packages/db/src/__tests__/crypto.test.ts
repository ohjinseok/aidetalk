/**
 * secret 암복호화 왕복 — 08_SECURITY.md §1.
 * 전용 키(SECRET_ENC_KEY 상당)와 폴백 키(SESSION_SECRET 상당) 양쪽 경로를 검증한다.
 */
import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, hashSecret, verifySecret } from "../crypto";

describe("encryptSecret/decryptSecret 왕복", () => {
  it("전용 키(SECRET_ENC_KEY 상당)로 암호화한 secret을 같은 키로 복호화하면 원문이 나온다", () => {
    const dedicatedKey = "dedicated_secret_enc_key_1234567890";
    const plaintext = "adt_super_secret_value";
    const enc = encryptSecret(plaintext, dedicatedKey);
    expect(enc).not.toContain(plaintext);
    expect(decryptSecret(enc, dedicatedKey)).toBe(plaintext);
  });

  it("폴백 키(SESSION_SECRET 상당)로 암호화·복호화해도 동일하게 동작한다", () => {
    const fallbackKey = "session_secret_fallback_key_abcdef";
    const plaintext = "whsec_webhook_secret_value";
    const enc = encryptSecret(plaintext, fallbackKey);
    expect(decryptSecret(enc, fallbackKey)).toBe(plaintext);
  });

  it("다른 키로 복호화하면 실패한다(변조/키 불일치 방어)", () => {
    const enc = encryptSecret("secret", "key_a_at_least_16_chars");
    expect(() => decryptSecret(enc, "key_b_at_least_16_chars")).toThrow();
  });

  it("hashSecret/verifySecret은 키 종류와 무관하게 동작한다", () => {
    const secret = "adt_abcdefg";
    const hash = hashSecret(secret);
    expect(verifySecret(secret, hash)).toBe(true);
    expect(verifySecret("wrong", hash)).toBe(false);
  });
});
