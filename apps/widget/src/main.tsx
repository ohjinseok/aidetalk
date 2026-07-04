import { mountApp } from "./app/mount";

/**
 * 데모 진입점 — dev 서버에서 위젯을 임베드해 로컬 서버(localhost:4000)와 대화한다.
 * 실제 배포에서는 로더(widget.js)가 이 마운트 과정을 대신한다(06 §1).
 */
const params = new URLSearchParams(location.search);
const workspaceId = params.get("ws") ?? (window as unknown as { AIDETALK_WS?: string }).AIDETALK_WS ?? "ws_demo";
const serverUrl = params.get("server") ?? "http://localhost:4000";

const host = document.createElement("div");
host.setAttribute("data-aidetalk", "host");
const shadow = host.attachShadow({ mode: "open" });
document.body.appendChild(host);

mountApp(shadow, { workspaceId, serverUrl });
