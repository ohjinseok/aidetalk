import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";

import { app } from "./app.js";

const port = Number(process.env.PORT ?? 4000);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] http listening on :${info.port}`);
});

/**
 * WS 게이트웨이 골격.
 * TODO: /ws/visitor, /ws/agent 인증 + 연결 레지스트리 + PubSubAdapter fan-out
 * (M1 W1-2, docs/04_API_SPEC.md §5.5 / docs/02_ARCHITECTURE.md §1-1)
 */
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws) => {
  console.log("[server] ws connection opened (placeholder handler)");
  ws.on("close", () => {
    console.log("[server] ws connection closed");
  });
});
