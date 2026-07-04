/**
 * E2E용 장수(long-lived) 보조 서버 2종 — 09_TESTING.md §7/§8.
 *  (1) 모의(스텁) 에이전트 HTTP 서버 — 05 프로토콜 계약대로 응답.
 *      · 손님 메시지 text === "상담원 연결" → handoff 응답(핸드오프 시나리오 5)
 *      · 그 외 → reply 응답 + quick_replies(["상담원 연결","가격 문의"])
 *  (2) 위젯 정적 호스트 — /app.js(빌드 산출물) + fixtures/host.html 제공.
 *
 * globalSetup이 이 프로세스를 spawn하고 종료 시 kill한다. 워크스페이스 패키지를 import하지
 * 않는 순수 Node라 어느 컨텍스트에서도 실행 가능하다.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AGENT_PORT = Number(process.env.E2E_AGENT_PORT ?? 4611);
const HOST_PORT = Number(process.env.E2E_HOST_PORT ?? 4612);
const DIST_DIR = join(__dirname, "..", "dist");
const FIXTURES_DIR = join(__dirname, "fixtures");

// ---------- (1) 스텁 에이전트 ----------
const HANDOFF_TRIGGER = "상담원 연결";

const agentServer = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      body = {};
    }
    const text = body?.message?.text ?? "";
    let response;
    if (text === HANDOFF_TRIGGER) {
      response = {
        type: "handoff",
        reason: "손님이 상담원 연결을 요청했습니다.",
        message_to_visitor: "상담원을 연결해 드릴게요. 잠시만 기다려 주세요.",
      };
    } else {
      response = {
        type: "reply",
        text: `자동 응답: ${text}`,
        quick_replies: [HANDOFF_TRIGGER, "가격 문의"],
      };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(response));
  });
});

// ---------- (2) 정적 호스트 ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function serveFile(res, path) {
  try {
    const data = await readFile(path);
    const ext = path.slice(path.lastIndexOf("."));
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}

const hostServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname = url.pathname;
  if (pathname === "/" || pathname === "") pathname = "/host.html";

  if (pathname === "/app.js") {
    await serveFile(res, join(DIST_DIR, "app.js"));
    return;
  }
  // fixtures 디렉터리 안으로만 제한(경로 탈출 방지).
  const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  await serveFile(res, join(FIXTURES_DIR, rel));
});

agentServer.listen(AGENT_PORT, "127.0.0.1", () => {
  console.log(`[e2e] stub agent on http://127.0.0.1:${AGENT_PORT}/agent`);
});
hostServer.listen(HOST_PORT, "127.0.0.1", () => {
  console.log(`[e2e] widget host on http://127.0.0.1:${HOST_PORT}`);
});

function shutdown() {
  agentServer.close();
  hostServer.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
