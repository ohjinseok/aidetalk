"use client";

import type { Suggestion } from "@aidetalk/shared";

import { td, tf } from "../../lib/i18n";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

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
  const rateLabel =
    acceptRate == null ? "—" : `${Math.round(acceptRate * 100)}%`;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
        <h3 className="text-sm font-semibold">{td("dashboard.assist.panelTitle")}</h3>
        <span className="text-xs text-gray-500">
          {tf("dashboard.assist.acceptRate", { rate: rateLabel })}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {suggestions.length === 0 ? (
          <EmptyState title={td("dashboard.assist.empty")} />
        ) : (
          suggestions.map((s) => {
            const isPending = s.outcome === "pending";
            const isDim = !isPending || dimmed.has(s.id);
            return (
              <div
                key={s.id}
                className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-opacity ${
                  isDim ? "opacity-50" : ""
                }`}
              >
                <p className="whitespace-pre-wrap text-sm text-gray-800">{s.draft}</p>
                {s.rationale ? (
                  <p className="mt-1.5 text-xs italic text-gray-400">{s.rationale}</p>
                ) : null}

                {s.actions && s.actions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.actions.map((a, i) => (
                      <Button
                        key={i}
                        variant="secondary"
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
                    <Button variant="primary" size="sm" onClick={() => onAccept(s)}>
                      {td("dashboard.assist.sendAsIs")}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onEdit(s)}>
                      {td("dashboard.assist.editAndSend")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onIgnore(s)}>
                      {td("dashboard.assist.ignore")}
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-400">
                    {s.outcome === "ignored"
                      ? td("dashboard.assist.ignored")
                      : td(s.outcome === "accepted" ? "dashboard.assist.sendAsIs" : "dashboard.assist.editAndSend")}
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
