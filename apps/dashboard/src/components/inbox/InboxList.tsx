"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationStatus } from "@aidetalk/shared";

import { inboxApi } from "../../lib/api/endpoints";
import { formatRelativeTime } from "../../lib/format";
import { td, tf, type TranslationKey } from "../../lib/i18n";
import type { InboxItem } from "../../lib/api/schemas";
import { patchInboxConversation, upsertInbox } from "../../lib/ws/reducer";
import { useSocketEvent } from "../providers/SocketProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Input } from "../ui/Field";
import { Spinner } from "../ui/Spinner";

const TABS: { status: ConversationStatus; labelKey: TranslationKey }[] = [
  { status: "open", labelKey: "dashboard.inbox.filterOpen" },
  { status: "pending", labelKey: "dashboard.inbox.filterPending" },
  { status: "closed", labelKey: "dashboard.inbox.filterClosed" },
];

/** 방문자 표시명 — 이름 없으면 "방문자 {뒤4자}"(07 §2.1). */
function visitorLabel(item: InboxItem): string {
  const name = item.visitor.name;
  if (name) return name;
  const id = item.visitor.id;
  return tf("dashboard.inbox.anonymousVisitor", { id: id.slice(-4) });
}

/** 브라우저 알림 권한 요청(핸드오프 알림용, 07 §2.1). */
function ensureNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") void Notification.requestPermission();
}

export function InboxList() {
  const { workspace } = useWorkspace();
  const wsId = workspace.id;
  const router = useRouter();
  const params = useParams<{ convId?: string }>();
  const activeConvId = params.convId;

  const [status, setStatus] = useState<ConversationStatus>("open");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const reqId = useRef(0);

  // 최초/필터/검색 변경 시 리셋 로드(검색은 디바운스).
  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  const load = useCallback(
    async (reset: boolean) => {
      const my = ++reqId.current;
      setLoading(true);
      try {
        const res = await inboxApi.list(wsId, {
          status,
          q: q || undefined,
          cursor: reset ? undefined : cursor || undefined,
        });
        if (my !== reqId.current) return; // 경쟁 응답 폐기
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        setCursor(res.nextCursor);
      } catch {
        // 목록 로드 실패는 조용히(빈 상태 유지). 통합 단계에서 토스트 연결.
      } finally {
        if (my === reqId.current) setLoading(false);
      }
    },
    [wsId, status, q, cursor],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(true), q ? 300 : 0);
    return () => clearTimeout(timer);
    // load는 cursor 의존이라 여기서 제외(리셋은 status/q 기준).
  }, [wsId, status, q]);

  // ---- 실시간 반영 ----
  useSocketEvent((msg) => {
    if (msg.type === "inbox.upsert") {
      setItems((prev) => upsertInbox(prev, msg.payload.conversationSummary, status));
    } else if (msg.type === "conversation.updated") {
      setItems((prev) => patchInboxConversation(prev, msg.payload.conversation, status));
    } else if (msg.type === "handoff.new") {
      const summary = msg.payload.conversationSummary;
      setItems((prev) => upsertInbox(prev, summary, status));
      // 3초 하이라이트
      const id = summary.conversation.id;
      setHighlight((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setHighlight((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 3000);
      // 브라우저 알림
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(td("dashboard.inbox.newHandoffTitle"), {
          body: msg.payload.summary ?? msg.payload.reason,
        });
      }
    }
  });

  // 키보드 ↑↓ Enter (07 §6 접근성)
  function onKeyDown(e: React.KeyboardEvent) {
    if (items.length === 0) return;
    const idx = items.findIndex((it) => it.conversation.id === activeConvId);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = items[Math.min(idx + 1, items.length - 1)];
      if (next) router.push(`/w/${wsId}/inbox/${next.conversation.id}`);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = items[Math.max(idx - 1, 0)];
      if (prev) router.push(`/w/${wsId}/inbox/${prev.conversation.id}`);
    }
  }

  return (
    <div
      className="flex h-full w-80 shrink-0 flex-col border-r border-gray-200 bg-white"
      onKeyDown={onKeyDown}
    >
      {/* 검색 */}
      <div className="border-b border-gray-100 p-2">
        <Input
          type="search"
          aria-label={td("dashboard.common.search")}
          placeholder={td("dashboard.inbox.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {/* 필터 탭 */}
      <div className="flex border-b border-gray-100" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            role="tab"
            aria-selected={status === tab.status}
            onClick={() => setStatus(tab.status)}
            className={`flex-1 py-2 text-xs font-medium ${
              status === tab.status
                ? "border-b-2 border-brand text-brand"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {td(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* 목록 */}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 && !loading ? (
          <li>
            <EmptyState
              title={td("dashboard.inbox.empty")}
              description={
                <Link href={`/w/${wsId}/settings/widget`} className="text-brand hover:underline">
                  {td("dashboard.inbox.emptyHint")}
                </Link>
              }
            />
          </li>
        ) : (
          items.map((item) => {
            const conv = item.conversation;
            const active = conv.id === activeConvId;
            const hl = highlight.has(conv.id);
            return (
              <li key={conv.id}>
                <Link
                  href={`/w/${wsId}/inbox/${conv.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`block border-b border-gray-50 px-3 py-2.5 transition-colors ${
                    hl ? "bg-yellow-100" : active ? "bg-indigo-50" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-800">
                      {visitorLabel(item)}
                    </span>
                    <span className="shrink-0 text-[11px] text-gray-400">
                      {conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Badge tone={conv.mode === "ai" ? "indigo" : "green"}>
                      {conv.mode === "ai" ? td("dashboard.inbox.modeAi") : td("dashboard.inbox.modeHuman")}
                    </Badge>
                    <span className="truncate text-xs text-gray-500">
                      {item.lastMessage?.textPreview ?? ""}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })
        )}
        {loading ? (
          <li className="flex justify-center py-3">
            <Spinner />
          </li>
        ) : null}
        {cursor && !loading ? (
          <li className="p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => void load(false)}>
              {td("dashboard.common.loadMore")}
            </Button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
