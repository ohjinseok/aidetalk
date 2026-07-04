/**
 * repo 계층 공통 타입.
 * - 모든 workspace-scoped repo 함수의 첫 인자는 workspaceId (CLAUDE.md 규칙 11).
 * - assist 계열은 memberContext 필수로 visitor 접근을 타입 레벨에서 차단(규칙 9).
 */

/**
 * 상담원(멤버) 자격 증명. assist_suggestions 조회/변경은 이 컨텍스트 없이는 호출 불가.
 * visitor 세션에는 이 값이 존재하지 않으므로 타입이 곧 접근 통제선이다.
 */
export interface MemberContext {
  userId: string;
  workspaceId: string;
  role: string; // 'owner' | 'agent_member'
}

/**
 * 키셋 페이지네이션 커서 — (created_at, id) 복합 정렬 기준.
 * null이면 처음부터.
 */
export interface Cursor {
  createdAt: string; // ISO
  id: string;
}
