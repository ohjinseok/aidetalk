import { useEffect, useRef } from "preact/hooks";

import type { WidgetController } from "../controller";
import { useSnapshot } from "../hooks/useSnapshot";
import { ChatWindow } from "./ChatWindow";
import { Launcher } from "./Launcher";

interface Props {
  controller: WidgetController;
}

const MOBILE_BREAKPOINT = 640;

/** 위젯 루트 — 런처 + 채팅창 + 전역 효과(visibilitychange·visualViewport·스크롤 잠금). */
export function App({ controller }: Props) {
  const snap = useSnapshot(controller);
  const rootRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const position = snap.settings?.launcherPosition === "left" ? "left" : "right";

  // --od-primary 주입(06 §2).
  useEffect(() => {
    rootRef.current?.style.setProperty("--od-primary", snap.primaryColor);
  }, [snap.primaryColor]);

  // iOS Safari 백그라운드 복귀 시 즉시 재연결(06 §4.2).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") controller.handleVisible();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [controller]);

  // iOS 키보드 대응 + 모바일 전체화면/스크롤 잠금(06 §4.3).
  useEffect(() => {
    if (!snap.open) return;

    const applyViewport = () => {
      const el = windowRef.current;
      if (!el) return;
      const vv = window.visualViewport;
      if (vv && window.innerWidth <= MOBILE_BREAKPOINT) {
        el.style.setProperty("--od-vv-height", `${vv.height}px`);
        // iOS: 키보드가 뷰포트를 밀어올릴 때 창을 위로 맞춘다.
        el.style.transform = `translateY(${vv.offsetTop}px)`;
      } else {
        el.style.removeProperty("--od-vv-height");
        el.style.transform = "";
      }
    };
    applyViewport();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", applyViewport);
    vv?.addEventListener("scroll", applyViewport);
    window.addEventListener("resize", applyViewport);

    // 모바일: 열림 동안 호스트 body 스크롤 잠금.
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    const prevOverflow = document.body.style.overflow;
    if (isMobile) document.body.style.overflow = "hidden";

    return () => {
      vv?.removeEventListener("resize", applyViewport);
      vv?.removeEventListener("scroll", applyViewport);
      window.removeEventListener("resize", applyViewport);
      if (isMobile) document.body.style.overflow = prevOverflow;
    };
  }, [snap.open]);

  return (
    <div class="od-root" ref={rootRef} style={{ "--od-primary": snap.primaryColor }}>
      {snap.open ? (
        <ChatWindow snap={snap} controller={controller} windowRef={windowRef} />
      ) : null}
      <Launcher
        open={snap.open}
        unread={snap.unread}
        position={position}
        onToggle={() => controller.toggle()}
      />
    </div>
  );
}
