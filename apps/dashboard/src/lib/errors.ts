/**
 * AppError code → i18n 키 매핑 — 07_DASHBOARD_SPEC §6.
 * 서버 에러 봉투의 code(04 §7)를 사용자 노출 문구로 변환한다.
 */
import { ERROR_STATUS, type ErrorCode } from "@aidetalk/shared";

import { td, type DashLocale } from "./i18n";

/** 에러 봉투 code가 알려진 ErrorCode인지 검사. */
export function isKnownErrorCode(code: string): code is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_STATUS, code);
}

/** code → 로컬라이즈 문구. 알 수 없는 code는 errors.unknown. */
export function errorMessage(code: string | undefined, locale?: DashLocale): string {
  if (code && isKnownErrorCode(code)) {
    return td(`errors.${code}`, locale);
  }
  if (code === "network") return td("errors.network", locale);
  return td("errors.unknown", locale);
}
