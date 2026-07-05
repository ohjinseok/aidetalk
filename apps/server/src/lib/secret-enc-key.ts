/**
 * Agent/웹훅 secret 암호화 전용 키 해석 — 08_SECURITY.md §1.
 * Stripe/Slack식으로 세션 키 로테이션과 분리된 전용 `SECRET_ENC_KEY`를 사용한다.
 * 미설정 시 SESSION_SECRET 파생으로 폴백(셀프호스팅 30분 셋업을 깨지 않기 위함) —
 * 이 경우 부팅 시 1회 경고 로그를 남긴다(context.ts에서 호출).
 */
import type { Env } from "../env";
import type { Logger } from "../logger";

/** encryptSecret/decryptSecret에 넘길 keyMaterial 문자열을 해석한다. */
export function resolveSecretEncKeyMaterial(
  env: Pick<Env, "SECRET_ENC_KEY" | "SESSION_SECRET">,
): string {
  return env.SECRET_ENC_KEY ?? env.SESSION_SECRET;
}

/** SECRET_ENC_KEY가 명시적으로 설정됐는지. */
export function isSecretEncKeyConfigured(env: Pick<Env, "SECRET_ENC_KEY">): boolean {
  return Boolean(env.SECRET_ENC_KEY);
}

/** 부팅 시 1회 — SECRET_ENC_KEY 미설정이면 폴백 안내 경고를 남긴다. */
export function warnIfSecretEncKeyMissing(
  env: Pick<Env, "SECRET_ENC_KEY">,
  logger: Pick<Logger, "warn">,
): void {
  if (isSecretEncKeyConfigured(env)) return;
  logger.warn(
    "SECRET_ENC_KEY 미설정 — SESSION_SECRET 파생 키로 암호화를 폴백한다. " +
      "세션 키 로테이션과 분리하려면 SECRET_ENC_KEY 설정을 권장한다(08_SECURITY.md §1).",
  );
}
