import { t } from "@aidetalk/i18n/widget";

import { CloseIcon } from "./icons";

interface Props {
  title: string;
  canHandoff: boolean;
  onHandoff: () => void;
  onClose: () => void;
}

/**
 * 워크스페이스 이름(15px semibold) + 부제(응답시간 안내) + "상담원 연결" + 닫기(06 §2).
 * primary가 동적이라 대비를 보장하기 어려우므로 헤더는 흰 배경 + 보더로 두고 primary는 포인트로만 쓴다.
 */
export function Header({ title, canHandoff, onHandoff, onClose }: Props) {
  return (
    <div class="od-header">
      <div class="od-header-main">
        <span class="od-title">{title}</span>
        <span class="od-subtitle">{t("widget.headerSubtitle")}</span>
      </div>
      {canHandoff ? (
        <button type="button" class="od-header-action" onClick={onHandoff}>
          {t("widget.connectAgent")}
        </button>
      ) : null}
      <button
        type="button"
        class="od-iconbtn"
        aria-label={t("widget.headerClose")}
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
