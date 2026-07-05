import { t } from "@aidetalk/i18n/widget";

import { ChatIcon, CloseIcon } from "./icons";

interface Props {
  open: boolean;
  unread: number;
  position: "left" | "right";
  onToggle: () => void;
}

/** 우하단(설정 시 좌하단) 원형 런처 — 미읽음 뱃지 포함(06 §2). */
export function Launcher({ open, unread, position, onToggle }: Props) {
  return (
    <button
      type="button"
      class={`od-launcher od-${position}`}
      aria-label={t(open ? "widget.launcherAriaClose" : "widget.launcherAriaOpen")}
      onClick={onToggle}
    >
      {open ? <CloseIcon /> : <ChatIcon />}
      {!open && unread > 0 ? <span class="od-badge">{unread > 99 ? "99+" : unread}</span> : null}
    </button>
  );
}
