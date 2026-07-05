/**
 * ID 생성 유틸 — 03_DATA_MODEL.md §0 규칙.
 * 모든 ID는 `prefix_nanoid(16)` 텍스트. serial/uuid 금지.
 */
import { nanoid } from "nanoid";

/**
 * 03 문서에 정의된 모든 엔티티 ID prefix.
 * 새 엔티티 추가 시 여기와 03 문서를 함께 갱신한다.
 */
export const ID_PREFIXES = [
  "ws", // workspaces
  "usr", // users
  "mbr", // members
  "agt", // agents
  "vis", // visitors
  "conv", // conversations
  "msg", // messages
  "evt", // conversation_events
  "alg", // agent_logs
  "tlk", // tracked_links
  "cvn", // conversions
  "asg", // assist_suggestions
  "whk", // webhooks
  "inv", // invites (미가입 이메일 초대)
] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

/** nanoid 기본 길이 — 03 문서 §0. */
export const ID_NANOID_SIZE = 16;

/**
 * `prefix_nanoid` 형식 ID 생성.
 * @param prefix 03 문서의 엔티티 prefix (타입으로 강제)
 * @param size nanoid 본문 길이 (기본 16). 짧은 토큰 등 특수 용도에서만 변경.
 */
export function newId(prefix: IdPrefix, size: number = ID_NANOID_SIZE): string {
  return `${prefix}_${nanoid(size)}`;
}
