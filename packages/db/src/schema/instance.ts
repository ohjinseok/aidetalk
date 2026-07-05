/**
 * instance — 셀프호스팅/클라우드 인스턴스 단위 메타데이터(단일 행). 03_DATA_MODEL.md §0.
 * 현재 용도: opt-in 텔레메트리의 인스턴스 익명 ID 저장(10_DEPLOYMENT.md). PII 없음.
 * 워크스페이스에 속하지 않는 전역 개념이라 workspaceId를 받지 않는다
 * (03 §3 workspaceRepo.create/userRepo와 동일한 예외 근거 — repo-types.test.ts 참고).
 */
import { pgTable, text } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";

export const instanceSettings = pgTable("instance_settings", {
  id: text("id").primaryKey(), // 항상 'singleton' — 프로세스당/DB당 단일 행
  anonymousId: text("anonymous_id").notNull(), // 랜덤 생성, 텔레메트리 페이로드의 유일한 식별자
  createdAt: createdAt(),
});
