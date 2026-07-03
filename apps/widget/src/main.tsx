import { mountLauncher } from "./mount";

/**
 * 데모 진입점: index.html에서 로드되어 호스트 div를 만들고 런처를 마운트한다.
 * 실제 임베드 로더(≤2KB)는 M1 W3-4에서 별도 구현 (06_WIDGET_SPEC.md §1).
 */
const host = document.createElement("div");
host.id = "aidetalk-widget-host";
document.body.appendChild(host);

mountLauncher(host);
