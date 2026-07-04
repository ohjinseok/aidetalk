import { t } from "@aidetalk/i18n";

import { CloseIcon } from "./icons";

interface Props {
  title: string;
  canHandoff: boolean;
  onHandoff: () => void;
  onClose: () => void;
}

/** 워크스페이스 이름 + "상담원 연결" + 닫기(06 §2). */
export function Header({ title, canHandoff, onHandoff, onClose }: Props) {
  return (
    <div class="od-header">
      <span class="od-title">{title}</span>
      {canHandoff ? (
        <button type="button" onClick={onHandoff}>
          {t("widget.connectAgent")}
        </button>
      ) : null}
      <button type="button" aria-label={t("widget.headerClose")} onClick={onClose}>
        <CloseIcon />
      </button>
    </div>
  );
}
