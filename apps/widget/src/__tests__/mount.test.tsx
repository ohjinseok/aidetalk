import { describe, expect, it } from "vitest";

import { mountLauncher } from "../mount";

describe("mountLauncher", () => {
  it("Shadow DOM 안에 런처 버튼을 렌더한다", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const shadowRoot = mountLauncher(host);
    const button = shadowRoot.querySelector("button.aidetalk-launcher");

    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("채팅 시작하기");
  });
});
