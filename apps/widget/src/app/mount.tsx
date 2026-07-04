import { render } from "preact";

import { App } from "./components/App";
import { WidgetController } from "./controller";
import { WIDGET_CSS } from "./styles";
import type { WidgetConfig } from "./types";

/**
 * 본체를 Shadow DOM 안에 마운트한다(06 §1·§2).
 * 스타일은 Shadow DOM 내부에 인라인 — 호스트 CSS와 완전 격리.
 */
export function mountApp(shadow: ShadowRoot, config: WidgetConfig): WidgetController {
  const style = document.createElement("style");
  style.textContent = WIDGET_CSS;
  const mountPoint = document.createElement("div");
  shadow.append(style, mountPoint);

  const controller = new WidgetController(config);
  // 이전 세션에서 열려 있었으면 복원(§3 sessionStorage).
  if (controller.wasOpen()) controller.openWidget();

  render(<App controller={controller} />, mountPoint);
  return controller;
}
