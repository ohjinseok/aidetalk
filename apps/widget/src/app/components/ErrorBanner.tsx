import { t, type WidgetTranslationKey } from "@aidetalk/i18n/widget";

import { CloseIcon } from "./icons";

interface Props {
  /** 컨트롤러 스냅샷의 error 코드(boot_failed / rate/limited / ApiError.code / 서버 error code). */
  code: string;
  onDismiss: () => void;
}

/** 에러 코드 → 사용자 문구 키. 아는 코드만 개별 매핑하고 나머지는 일반 문구로. */
function messageKey(code: string): WidgetTranslationKey {
  switch (code) {
    case "boot_failed":
      return "widget.errorConnection";
    case "rate/limited":
      return "widget.errorRateLimited";
    default:
      return "widget.errorGeneric";
  }
}

/**
 * 패널 상단 dismissible 에러 배너(06 §2 디자인 언어 — 플랫, 보더 우선, 이모지/그라데이션 금지).
 * 전송 실패 버블(od-failed)과 같은 레드 팔레트를 재사용해 위젯 안에서 일관되게 보이게 한다.
 */
export function ErrorBanner({ code, onDismiss }: Props) {
  return (
    <div class="od-errorbar" role="alert">
      <span class="od-errorbar-text">{t(messageKey(code))}</span>
      <button
        type="button"
        class="od-errorbar-close"
        aria-label={t("widget.errorDismiss")}
        onClick={onDismiss}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
