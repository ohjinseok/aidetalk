"use client";

import Link from "next/link";

import type { MessageRole } from "@aidetalk/shared";

import { formatHm, formatMessageTime } from "../../lib/format";
import { td, tf, type TranslationKey } from "../../lib/i18n";
import type { TimelineItem } from "../../lib/timeline";

/** 링크 클릭 상태(트래킹, S1). */
export type TrackedMap = Map<string, { clickedAt: string | null }>;

function bubbleAlign(role: MessageRole): "left" | "right" | "center" {
  if (role === "visitor") return "left";
  if (role === "system") return "center";
  return "right"; // agent_ai / agent_human
}

function bubbleStyle(role: MessageRole): string {
  switch (role) {
    case "visitor":
      return "bg-white border border-gray-200 text-gray-800";
    case "agent_ai":
      return "bg-indigo-50 text-indigo-900";
    case "agent_human":
      return "bg-brand text-white";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

/** 대화 타임라인 렌더 — 07 §2.2. 메시지 말풍선 + 회색 시스템 이벤트 라인. */
export function Timeline({
  items,
  wsId,
  tracked,
}: {
  items: TimelineItem[];
  wsId: string;
  tracked?: TrackedMap;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-4">
      {items.map((item) => {
        if (item.kind === "event") {
          const ev = item.event;
          const key = `dashboard.event.${ev.type}` as TranslationKey;
          const reason = typeof ev.payload?.reason === "string" ? (ev.payload.reason as string) : "";
          const label =
            td(key) + (reason ? tf("dashboard.event.reasonSuffix", { reason }) : "");
          return (
            <div key={item.id} className="my-1 text-center">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
                {label} · {formatMessageTime(ev.createdAt)}
              </span>
            </div>
          );
        }

        const m = item.message;
        const align = bubbleAlign(m.role);
        const link = tracked?.get(m.id);
        return (
          <div
            key={item.id}
            className={`flex ${
              align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"
            }`}
          >
            <div className="max-w-[70%]">
              <div className={`rounded-lg px-3 py-2 text-sm ${bubbleStyle(m.role)}`}>
                <p className="whitespace-pre-wrap break-words">{m.content.text}</p>
              </div>
              <div
                className={`mt-0.5 flex items-center gap-2 text-[11px] text-gray-400 ${
                  align === "right" ? "justify-end" : "justify-start"
                }`}
              >
                <span>{formatMessageTime(m.createdAt)}</span>
                {m.role === "agent_ai" ? (
                  <Link href={`/w/${wsId}/agents`} className="text-brand hover:underline">
                    {td("dashboard.conversation.viewLog")}
                  </Link>
                ) : null}
                {link ? (
                  <span className={link.clickedAt ? "text-green-600" : "text-gray-400"}>
                    {link.clickedAt
                      ? tf("dashboard.conversation.linkClickedAt", { time: formatHm(link.clickedAt) })
                      : td("dashboard.conversation.linkNotClicked")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
