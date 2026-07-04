import { t } from "@aidetalk/i18n";

import type { WidgetController, WidgetSnapshot } from "../controller";
import { ChatWindowBody } from "./ChatWindowBody";
import { Header } from "./Header";

interface Props {
  snap: WidgetSnapshot;
  controller: WidgetController;
  windowRef: preact.RefObject<HTMLDivElement>;
}

function statusText(snap: WidgetSnapshot): string | null {
  switch (snap.connection) {
    case "connecting":
      return t("widget.statusConnecting");
    case "reconnecting":
      return t("widget.statusReconnecting");
    case "polling":
      return t("widget.statusPolling");
    case "offline":
      return t("widget.statusOffline");
    default:
      return null;
  }
}

/** 380×640 카드(모바일 전체화면). Header + 상태바 + 본문(06 §2). */
export function ChatWindow({ snap, controller, windowRef }: Props) {
  const title = snap.workspaceName ?? t("widget.headerTitle");
  const status = snap.phase === "ready" ? statusText(snap) : null;
  const position = snap.settings?.launcherPosition === "left" ? "left" : "right";

  return (
    <div class={`od-window od-${position} od-vv`} ref={windowRef}>
      <Header
        title={title}
        canHandoff={snap.conversationId != null}
        onHandoff={() => void controller.requestHandoff()}
        onClose={() => controller.close()}
      />
      {status ? <div class="od-statusbar">{status}</div> : null}
      <ChatWindowBody snap={snap} controller={controller} />
    </div>
  );
}
