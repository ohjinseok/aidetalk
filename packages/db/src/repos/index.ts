/**
 * repository 계층 진입점 — 03_DATA_MODEL.md §3.
 * 라우트 핸들러는 DB를 직접 만지지 않고 이 repo 함수들로만 접근한다.
 *
 * 사용: `const repos = createRepos(db);` → `repos.conversation.create(workspaceId, ...)`.
 * 모든 workspace-scoped 함수의 첫 인자는 workspaceId(규칙 11).
 */
import type { Database } from "../client";
import { makeAgentLogRepo } from "./agent-log";
import { makeAgentRepo } from "./agent";
import { makeAssistRepo } from "./assist";
import { makeConversationRepo } from "./conversation";
import { makeConversionRepo } from "./conversion";
import { makeEventRepo } from "./event";
import { makeInviteRepo } from "./invite";
import { makeMemberRepo } from "./member";
import { makeMessageRepo } from "./message";
import { makeTrackedLinkRepo } from "./tracked-link";
import { makeUserRepo } from "./user";
import { makeVisitorRepo } from "./visitor";
import { makeWebhookRepo } from "./webhook";
import { makeWorkspaceRepo } from "./workspace";

export * from "./_context";
export * from "./workspace";
export * from "./user";
export * from "./member";
export * from "./invite";
export * from "./agent";
export * from "./visitor";
export * from "./conversation";
export * from "./message";
export * from "./event";
export * from "./agent-log";
export * from "./tracked-link";
export * from "./conversion";
export * from "./assist";
export * from "./webhook";

/** 모든 repo를 하나의 db 인스턴스에 바인딩해 반환. */
export function createRepos(db: Database) {
  return {
    workspace: makeWorkspaceRepo(db),
    user: makeUserRepo(db),
    member: makeMemberRepo(db),
    invite: makeInviteRepo(db),
    agent: makeAgentRepo(db),
    visitor: makeVisitorRepo(db),
    conversation: makeConversationRepo(db),
    message: makeMessageRepo(db),
    event: makeEventRepo(db),
    agentLog: makeAgentLogRepo(db),
    trackedLink: makeTrackedLinkRepo(db),
    conversion: makeConversionRepo(db),
    assist: makeAssistRepo(db),
    webhook: makeWebhookRepo(db),
  };
}

export type Repos = ReturnType<typeof createRepos>;
