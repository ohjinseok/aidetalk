import { render } from "preact";

import { Launcher } from "./launcher";

/**
 * 위젯 런처를 호스트 엘리먼트의 Shadow DOM 안에 렌더한다.
 * Shadow DOM 격리로 호스트 페이지 CSS와 충돌을 막는다 (06_WIDGET_SPEC.md §1).
 */
export function mountLauncher(host: HTMLElement): ShadowRoot {
  const shadowRoot = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .aidetalk-launcher {
      font-family: system-ui, -apple-system, sans-serif;
      border: none;
      border-radius: 9999px;
      padding: 12px 20px;
      cursor: pointer;
      background: #4f46e5;
      color: #fff;
      font-size: 14px;
    }
  `;

  const mountPoint = document.createElement("div");
  shadowRoot.append(style, mountPoint);
  render(<Launcher />, mountPoint);

  return shadowRoot;
}
