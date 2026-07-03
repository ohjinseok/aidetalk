/**
 * packages/shared — placeholder
 *
 * 실제 구현(예정, 다른 세션 담당):
 * - id 유틸(newId), plans.ts, AppError, 에러 코드 상수(04_API_SPEC.md §7)
 * - Agent Protocol zod 스키마(05_AGENT_PROTOCOL.md와 1:1)
 * - WS 메시지 봉투/타입 union(04_API_SPEC.md §5)
 * - StorageAdapter / PubSubAdapter 인터페이스(02_ARCHITECTURE.md §1-1)
 *
 * 이 패키지가 서버/위젯/대시보드의 API 계약 단일 출처가 된다.
 * 지금은 워크스페이스 배선 확인용 placeholder export만 둔다.
 */
export const SHARED_PACKAGE_NAME = "@aidetalk/shared" as const;
