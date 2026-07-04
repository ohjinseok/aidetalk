/**
 * assistRepo — assist_suggestions(상담 어시스트, 상담원 전용). 03_DATA_MODEL.md §3.
 *
 * ⚠️ CLAUDE.md 절대 규칙 9: visitor 자격으로 절대 조회/변경 불가.
 * 조회(listByConversation)와 변경(setOutcome)은 MemberContext를 필수로 받아
 * visitor 세션(토큰)으로는 타입상 호출조차 불가능하게 만든다.
 * append는 agent dispatch 파이프라인(system)이 생성하므로 memberContext를 받지 않는다.
 */
import { newId } from "@aidetalk/shared";
import { AppError } from "@aidetalk/shared";
import { and, asc, eq } from "drizzle-orm";

import type { Database } from "../client";
import { assistSuggestions } from "../schema/assist-suggestions";
import type { MemberContext } from "./_context";

export interface AppendSuggestionInput {
  conversationId: string;
  triggerMessageId: string;
  draft: string;
  rationale?: string | null;
  actions?: { label: string; url: string }[] | null;
  source?: "agent" | "builtin";
}

export function makeAssistRepo(db: Database) {
  return {
    /** 제안 생성 — dispatcher(system)가 호출. 손님에게 전송 금지(규칙 9). */
    async append(workspaceId: string, input: AppendSuggestionInput) {
      const [row] = await db
        .insert(assistSuggestions)
        .values({
          id: newId("asg"),
          workspaceId,
          conversationId: input.conversationId,
          triggerMessageId: input.triggerMessageId,
          draft: input.draft,
          rationale: input.rationale ?? null,
          actions: input.actions ?? null,
          source: input.source ?? "agent",
          outcome: "pending",
        })
        .returning();
      return row!;
    },

    /**
     * 제안 결과 기록(accepted/edited/ignored). 상담원 전용 — memberContext 필수.
     * memberContext.workspaceId와 요청 workspaceId가 다르면 forbidden.
     */
    async setOutcome(
      workspaceId: string,
      suggestionId: string,
      outcome: "accepted" | "edited" | "ignored",
      memberContext: MemberContext,
    ) {
      if (memberContext.workspaceId !== workspaceId) {
        throw AppError.of("auth/forbidden", "다른 워크스페이스의 제안에 접근할 수 없다.");
      }
      const [row] = await db
        .update(assistSuggestions)
        .set({ outcome })
        .where(
          and(
            eq(assistSuggestions.workspaceId, workspaceId),
            eq(assistSuggestions.id, suggestionId),
          ),
        )
        .returning();
      return row;
    },

    /**
     * 대화의 제안 목록 — 상담원 전용, memberContext 필수.
     * visitor는 MemberContext를 가질 수 없어 호출 불가(규칙 9).
     */
    async listByConversation(
      workspaceId: string,
      conversationId: string,
      memberContext: MemberContext,
    ) {
      if (memberContext.workspaceId !== workspaceId) {
        throw AppError.of("auth/forbidden", "다른 워크스페이스의 제안에 접근할 수 없다.");
      }
      return db
        .select()
        .from(assistSuggestions)
        .where(
          and(
            eq(assistSuggestions.workspaceId, workspaceId),
            eq(assistSuggestions.conversationId, conversationId),
          ),
        )
        .orderBy(asc(assistSuggestions.createdAt), asc(assistSuggestions.id));
    },
  };
}

export type AssistRepo = ReturnType<typeof makeAssistRepo>;
