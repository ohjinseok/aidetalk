import { t } from "@aidetalk/i18n";

/**
 * 대시보드 홈에서 보여줄 환영 문구.
 * 하드코딩 대신 packages/i18n의 ko 키를 사용한다 (CLAUDE.md 절대 규칙 4).
 */
export function getWelcomeMessage(): string {
  return t("common.welcome");
}
