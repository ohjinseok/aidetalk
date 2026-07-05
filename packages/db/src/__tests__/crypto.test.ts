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

describe("verifySecret — timing-safe 비교(08_SECURITY.md §1 남은 리스크 3)", () => {
  it("일치하는 secret/hash는 true", () => {
    const secret = "whsec_" + "a".repeat(32);
    expect(verifySecret(secret, hashSecret(secret))).toBe(true);
  });

  it("불일치하는 secret은 false(같은 길이 hash와 비교)", () => {
    const hash = hashSecret("adt_" + "a".repeat(32));
    expect(verifySecret("adt_" + "b".repeat(32), hash)).toBe(false);
  });

  it("storedHash 길이가 다르면(변조/오염) timingSafeEqual 비교 없이 false", () => {
    expect(verifySecret("adt_abcdefg", "not_a_valid_hex_hash")).toBe(false);
    expect(verifySecret("adt_abcdefg", "")).toBe(false);
  });
});
