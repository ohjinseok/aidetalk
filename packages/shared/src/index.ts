/**
 * @aidetalk/shared — API 계약 단일 출처(zod 스키마) + 공유 타입.
 * 서버/위젯/대시보드는 모든 계약을 여기서 import한다. 임의 JSON 금지(CLAUDE.md 코딩 컨벤션).
 */
export * from "./id";
export * from "./plans";
export * from "./errors";
export * from "./agent-protocol";
export * from "./entities";
export * from "./widget-settings";
export * from "./ws-protocol";
export * from "./adapters";
