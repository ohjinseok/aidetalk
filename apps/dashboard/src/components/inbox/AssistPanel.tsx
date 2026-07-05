"use client";

import type { Suggestion } from "@aidetalk/shared";

import { td, tf } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { AiChip } from "./AiChip";

/**
 * 어시스트 사이드 패널(우 컬럼, mode=human 전용) — 07 §2.3.
 * ⚠️ CLAUDE.md 규칙 9: assist 데이터는 상담원 화면 전용. visitor에게 절대 노출/전송 금지.
 * 이 컴포넌트는 상태를 갖지 않는 표현부. 데이터/아웃컴 로직은 ConversationView가 소유.
 */
export function AssistPanel({
  suggestions,
  dimmed,
  acceptRate,
  onAccept,
  onEdit,
  onIgnore,
  onInsertLink,
}: {
  suggestions: Suggestion[];
  dimmed: Set<string>;
  /** 0~1 채택률(accepted+edited / pending 제외 전체). null이면 표시 안 함. */
  acceptRate: number | null;
  onAccept: (s: Suggestion) => void;
  onEdit: (s: Suggestion) => void;
  onIgnore: (s: Suggestion) => void;
  onInsertLink: (url: string) => void;
}) {
  const rateLabel = acceptRate == null ? "—" : `${Math.round(acceptRate * 100)}%`;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
        <h3 className="text-sm font-medium">{td("dashboard.assist.panelTitle")}</h3>
        <span className="text-xs text-muted-foreground">
          {tf("dashboard.assist.acceptRate", { rate: rateLabel })}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {suggestions.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{td("dashboard.assist.empty")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          suggestions.map((s) => {
            const isPending = s.outcome === "pending";
            const isDim = !isPending || dimmed.has(s.id);
            return (
              <div
                key={s.id}
                className={`rounded-lg border border-border bg-card p-3 shadow-xs transition-opacity ${
                  isDim ? "opacity-50" : ""
                }`}
              >
                {/* 화자 문법 잔향 — 이 제안이 AI에게서 왔음을 "AI" 모노그램 칩으로 표시. */}
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <AiChip />
                  <span>{td("dashboard.inbox.suggestionLabel")}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{s.draft}</p>
                {s.rationale ? (
                  <p className="mt-1.5 text-xs italic text-muted-foreground">{s.rationale}</p>
                ) : null}

                {s.actions && s.actions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.actions.map((a, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        onClick={() => onInsertLink(a.url)}
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                ) : null}

                {isPending ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => onAccept(s)}>
                      {td("dashboard.assist.sendAsIs")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onEdit(s)}>
                      {td("dashboard.assist.editAndSend")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onIgnore(s)}>
                      {td("dashboard.assist.ignore")}
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {s.outcome === "ignored"
                      ? td("dashboard.assist.ignored")
                      : td(
                          s.outcome === "accepted"
                            ? "dashboard.assist.sendAsIs"
                            : "dashboard.assist.editAndSend",
                        )}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
