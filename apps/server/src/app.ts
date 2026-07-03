import { Hono } from "hono";

/**
 * Hono 앱 인스턴스. 실제 HTTP 서버 부팅(src/index.ts)과 분리해서
 * `app.request()`로 테스트할 수 있게 한다.
 *
 * 라우트 확장 시 packages/shared의 zod 스키마를 단일 계약으로 사용한다
 * (CLAUDE.md 코딩 컨벤션). 지금은 M0 스캐폴드 단계라 /healthz만 존재.
 */
export const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true }));
