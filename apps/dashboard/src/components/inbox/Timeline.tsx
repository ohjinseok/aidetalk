"use client";

import Link from "next/link";

import type { MessageRole } from "@aidetalk/shared";

import { formatHm, formatMessageTime } from "../../lib/format";
import { td, tf, type TranslationKey } from "../../lib/i18n";
import type { TimelineItem } from "../../lib/timeline";
import { AiChip } from "./AiChip";

/** 링크 클릭 상태(트래킹, S1). */
export type TrackedMap = Map<string, { clickedAt: string | null }>;

function bubbleAlign(role: MessageRole): "left" | "right" | "center" {
  if (role === "visitor") return "left";
  if (role === "system") return "center";
  return "right"; // agent_ai / agent_human
}

/**
 * 화자 문법 — "누가 말하는가"를 버블 하나로 표현.
 * - visitor: 뉴트럴, - agent_ai: 인디고 아웃라인(기계가 대신 말함), - agent_human: 인디고 솔리드.
 * 말꼬리(rounded-br/bl-md)로 좌우 방향성을 미묘하게 준다.
 */
function bubbleStyle(role: MessageRole): string {
  switch (role) {
    case "visitor":
      return "rounded-2xl rounded-bl-md bg-muted text-foreground";
    case "agent_ai":
      return "rounded-2xl rounded-br-md border border-primary/25 bg-primary/5 text-foreground";
    case "agent_human":
      return "rounded-2xl rounded-br-md bg-primary text-primary-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** 대화 타임라인 렌더 — 07 §2.2. 화자 문법 버블 + 중앙 시스템 이벤트 라인. */
export function Timeline({
  items,
  wsId,
  tracked,
  readReceiptMsgId,
}: {
  items: TimelineItem[];
  wsId: string;
  tracked?: TrackedMap;
  /** 이 메시지 id 아래에 "읽음"을 표시(손님이 읽은 상담원 마지막 메시지). */
  readReceiptMsgId?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-4">
      {items.map((item, i) => {
        if (item.kind === "event") {
          const ev = item.event;
          const key = `dashboard.event.${ev.type}` as TranslationKey;
          const reason = typeof ev.payload?.reason === "string" ? (ev.payload.reason as string) : "";
          const label =
            td(key) + (reason ? tf("dashboard.event.reasonSuffix", { reason }) : "");
          return (
            <div key={item.id} className="my-2 text-center text-xs text-muted-foreground">
              <span>
                {label} · {formatMessageTime(ev.createdAt)}
              </span>
            </div>
          );
        }

        const m = item.message;
        const align = bubbleAlign(m.role);

        // ---- 같은 화자 연속 그룹핑: 간격 축소 + 메타는 그룹 마지막에만 ----
        const prev = items[i - 1];
        const next = items[i + 1];
        const samePrev = prev?.kind === "message" && prev.message.role === m.role;
        const sameNext = next?.kind === "message" && next.message.role === m.role;
        const groupStart = !samePrev; // 런의 첫 버블
        const groupEnd = !sameNext; // 런의 마지막 버블

        // 시스템 메시지 중앙 정렬.
        if (align === "center") {
          return (
            <div key={item.id} className="my-2 text-center text-xs text-muted-foreground">
              <span className="whitespace-pre-wrap break-words">{m.content.text}</span>
            </div>
          );
        }

        const link = tracked?.get(m.id);
        const isReadReceipt = !!readReceiptMsgId && m.id === readReceiptMsgId;
        // 타임스탬프/로그·읽음 메타는 그룹 마지막에만. 단, 링크 클릭 상태·읽음은 해당 메시지에 붙는다.
        const showMeta = groupEnd || !!link || isReadReceipt;

        return (
          <div
            key={item.id}
            className={`flex ${align === "right" ? "justify-end" : "justify-start"} ${
              i > 0 && groupStart ? "mt-2" : ""
            }`}
          >
            <div className="max-w-[70%]">
              {/* AI 화자 표시 — 기계가 대신 말함을 "AI" 모노그램 칩으로(그룹 첫 버블만). */}
              {m.role === "agent_ai" && groupStart ? (
                <div className="mb-1 flex justify-end">
                  <AiChip />
                </div>
              ) : null}
              <div className={`px-3 py-2 text-sm ${bubbleStyle(m.role)}`}>
                <p className="whitespace-pre-wrap break-words">{m.content.text}</p>
              </div>
              {showMeta ? (
                <div
                  className={`mt-0.5 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground ${
                    align === "right" ? "justify-end" : "justify-start"
                  }`}
                >
                  {groupEnd ? <span>{formatMessageTime(m.createdAt)}</span> : null}
                  {groupEnd && m.role === "agent_ai" ? (
                    <Link href={`/w/${wsId}/agents`} className="text-primary hover:underline">
                      {td("dashboard.conversation.viewLog")}
                    </Link>
                  ) : null}
                  {link ? (
                    <span
                      className={
                        link.clickedAt
                          ? "text-green-600 dark:text-green-400"
                          : "text-muted-foreground"
                      }
                    >
                      {link.clickedAt
                        ? tf("dashboard.conversation.linkClickedAt", { time: formatHm(link.clickedAt) })
                        : td("dashboard.conversation.linkNotClicked")}
                    </span>
                  ) : null}
                  {isReadReceipt ? (
                    <span className="text-primary">{td("dashboard.conversation.readReceipt")}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
