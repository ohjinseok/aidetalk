import { t } from "@aidetalk/i18n";

/**
 * 위젯 런처 버튼. 문자열은 반드시 packages/i18n의 키를 통해 노출한다
 * (CLAUDE.md 절대 규칙 4 — 하드코딩 금지).
 */
export function Launcher() {
  return (
    <button type="button" class="aidetalk-launcher">
      {t("widget.launcherLabel")}
    </button>
  );
}
