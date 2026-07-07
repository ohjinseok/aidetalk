"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ConversationStatus, InboxItem, Tag } from "@aidetalk/shared";

import { Search } from "lucide-react";

import { inboxApi, memberApi } from "@/lib/api/endpoints";
import { formatRelativeTime } from "@/lib/format";
import { td, tf, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { patchInboxConversation, upsertInbox } from "@/lib/ws/reducer";
import { useSocketEvent } from "@/components/providers/SocketProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { AiChip } from "./AiChip";
import { filterToListParams, useInboxFilter, type InboxFilter } from "./InboxFilterProvider";
import { TagBadge } from "./TagBadge";
import { AvatarVisitor } from "@/components/ui/avatar-visitor";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

/** 현재 필터명 헤더 타이틀 — 사이드바 필터명/태그명/멤버명(07 §2.1). */
function filterTitle(
  filter: InboxFilter,
  tagById: Map<string, Tag>,
  memberNames: Map<string, string>,
): string {
  switch (filter.kind) {
    case "mine":
      return td("dashboard.inboxSidebar.mine");
    case "all":
      return td("dashboard.inboxSidebar.all");
    case "unread":
      return td("dashboard.inboxSidebar.unread");
    case "favorites":
      return td("dashboard.inboxSidebar.favorites");
    case "unassigned":
      return td("dashboard.inboxSidebar.unassigned");
    case "assignee":
      return memberNames.get(filter.userId) ?? td("dashboard.inboxSidebar.byAssignee");
    case "tag":
      return tagById.get(filter.tagId)?.name ?? td("dashboard.inboxSidebar.tags");
  }
}

/** 브라우저 알림 권한 요청(핸드오프 알림용, 07 §2.1). */
function ensureNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") void Notification.requestPermission();
}

export function InboxList() {
  const { workspace, me } = useWorkspace();
  const wsId = workspace.id;
  const router = useRouter();
  const params = useParams<{ convId?: string }>();
  const activeConvId = params.convId;

  // 필터·상태는 3컬럼 공유 컨텍스트에서(사이드바가 결정). 상태 탭만 여기서 전환.
  const { filter, status, setStatus, tagById } = useInboxFilter();

  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  // 담당자명 표시용 캐시(워크스페이스당 1회 조회, 과도한 요청 금지).
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());
  const reqId = useRef(0);

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  useEffect(() => {
    let alive = true;
    memberApi
      .list(wsId)
      .then((members) => {
        if (!alive) return;
        setMemberNames(new Map(members.map((m) => [m.userId, m.name ?? m.email ?? m.userId])));
      })
      .catch(() => {
        // 담당자명 조회 실패는 조용히(이름 대신 필터 라벨/생략으로 폴백).
      });
    return () => {
      alive = false;
    };
  }, [wsId]);

  // 필터 → list 쿼리 파라미터. mine은 헬퍼가 빈 객체를 주므로 me.user.id로 치환(헬퍼 JSDoc).
  const listParams = useMemo(() => {
    const base = filterToListParams(filter);
    if (filter.kind === "mine") return { ...base, assigneeId: me.user.id };
    return base;
  }, [filter, me.user.id]);
  // 필터 변경 감지용 안정 키(리셋 재조회 트리거).
  const filterKey = useMemo(() => JSON.stringify(listParams), [listParams]);

  const load = useCallback(
    async (reset: boolean) => {
      const my = ++reqId.current;
      setLoading(true);
      try {
        const res = await inboxApi.list(wsId, {
          ...listParams,
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
    [wsId, status, q, cursor, listParams],
  );

  // 최초/필터/상태/검색 변경 시 리셋 로드(검색은 디바운스).
  useEffect(() => {
    const timer = setTimeout(() => void load(true), q ? 300 : 0);
    return () => clearTimeout(timer);
    // load는 cursor 의존이라 여기서 제외(리셋은 filter/status/q 기준).
  }, [wsId, status, q, filterKey]);

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

  // 대화 열람 시 해당 항목 unread 낙관적 0 처리(재조회 없이 즉시 반영).
  const markRead = useCallback((convId: string) => {
    setItems((prev) =>
      prev.map((it) => (it.conversation.id === convId ? { ...it, unread: 0 } : it)),
    );
  }, []);

  function toggleSearch() {
    setSearchOpen((open) => {
      if (open) setQ(""); // 닫을 때 검색어 초기화(숨은 필터 방지)
      return !open;
    });
  }

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
      className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-background"
      onKeyDown={onKeyDown}
    >
      {/* 헤더 — 현재 필터명 + 검색 토글, 아래 상태 세그먼트 필 탭. */}
      <div className="border-b border-border">
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {filterTitle(filter, tagById, memberNames)}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            aria-label={td("dashboard.common.search")}
            aria-pressed={searchOpen}
            onClick={toggleSearch}
          >
            <Search className="size-4" aria-hidden />
          </Button>
        </div>
        {searchOpen ? (
          <div className="px-3 pt-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                autoFocus
                aria-label={td("dashboard.common.search")}
                placeholder={td("dashboard.inbox.searchPlaceholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-8 border-transparent bg-muted/50 pl-8 focus-visible:bg-background"
              />
            </div>
          </div>
        ) : null}
        <div className="px-2 pb-2 pt-2">
          <Tabs value={status} onValueChange={(v) => setStatus(v as ConversationStatus)}>
            <TabsList variant="pill" className="w-full">
              {TABS.map((tab) => (
                <TabsTrigger key={tab.status} value={tab.status} className="flex-1 text-xs">
                  {td(tab.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* 목록 */}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 && !loading ? (
          <li>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{td("dashboard.inbox.empty")}</EmptyTitle>
                <EmptyDescription>
                  <Link
                    href={`/w/${wsId}/settings/widget`}
                    className="text-primary hover:underline"
                  >
                    {td("dashboard.inbox.emptyHint")}
                  </Link>
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </li>
        ) : (
          items.map((item) => {
            const conv = item.conversation;
            const active = conv.id === activeConvId;
            const hl = highlight.has(conv.id);
            const label = visitorLabel(item);
            const isAi = conv.mode === "ai";
            const unread = item.unread ?? 0;
            const hasUnread = unread > 0;
            const tagIds = item.tagIds ?? [];
            const shownTags = tagIds
              .slice(0, 2)
              .map((id) => tagById.get(id))
              .filter((t): t is Tag => Boolean(t));
            const extraTags = tagIds.length - 2;
            const assigneeName = conv.assigneeId ? memberNames.get(conv.assigneeId) : undefined;
            const hasThirdLine = shownTags.length > 0 || Boolean(assigneeName);
            return (
              <li key={conv.id}>
                <Link
                  href={`/w/${wsId}/inbox/${conv.id}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => markRead(conv.id)}
                  className={cn(
                    "flex items-start gap-2.5 border-b border-border px-3 py-2.5 transition-colors",
                    hl ? "bg-warning/10" : active ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <AvatarVisitor seed={conv.id} label={label} size="md" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    {/* 1줄: 이름 + 상대시각 */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {label}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : ""}
                      </span>
                    </div>
                    {/* 2줄: 미리보기 + unread 카운트 뱃지 */}
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {isAi ? <AiChip /> : null}
                      <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                        {item.lastMessage?.textPreview ?? ""}
                      </span>
                      {hasUnread ? (
                        <span
                          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-info px-1.5 text-[11px] font-medium tabular-nums text-info-foreground"
                          aria-label={td("dashboard.inbox.unread")}
                        >
                          {unread > 99 ? "99+" : unread}
                        </span>
                      ) : null}
                    </div>
                    {/* 3줄(있을 때만): 태그 + 담당자 */}
                    {hasThirdLine ? (
                      <div className="mt-1 flex items-center gap-1 overflow-hidden">
                        {shownTags.map((tag) => (
                          <TagBadge key={tag.id} tag={tag} />
                        ))}
                        {extraTags > 0 ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            +{extraTags}
                          </span>
                        ) : null}
                        {assigneeName ? (
                          <span className="ml-auto shrink-0 truncate pl-1 text-[11px] text-muted-foreground">
                            {assigneeName}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
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
