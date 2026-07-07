"use client";

import { useEffect, useMemo, useState } from "react";

import type { InboxCounts, Member, Tag } from "@aidetalk/shared";

import {
  ChevronRight,
  Inbox,
  MailWarning,
  PanelLeftClose,
  PanelLeftOpen,
  Star,
  User,
  UserX,
} from "lucide-react";

import { memberApi } from "@/lib/api/endpoints";
import { td, type TranslationKey } from "@/lib/i18n";
import { TAG_COLOR_CLASSES, groupTagsByPath, tagShortName } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useInboxFilter, type InboxFilter } from "./InboxFilterProvider";

/** 활성 필터 판정 — kind + id 딥 비교(참조 아님). */
function isSameFilter(a: InboxFilter, b: InboxFilter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "assignee" && b.kind === "assignee") return a.userId === b.userId;
  if (a.kind === "tag" && b.kind === "tag") return a.tagId === b.tagId;
  return true;
}

/** 멤버 표시명 — 이름 > 이메일 > userId 순(데이터 폴백, UI 문자열 아님). */
function memberLabel(m: Member): string {
  return m.name || m.email || m.userId;
}

/** 좌측 카운트 배지 — 0/undefined면 렌더하지 않는다. */
function CountBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>;
}

interface RowProps {
  active: boolean;
  onSelect: () => void;
  icon?: React.ReactNode;
  label: string;
  count?: number;
  /** 태그/그룹 들여쓰기 단계. */
  indent?: boolean;
}

/** 필터 선택 행(버튼) 공통. 활성 = bg-accent + font-medium. */
function FilterRow({ active, onSelect, icon, label, count, indent }: RowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors",
        indent ? "pl-7" : "pl-2",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-foreground/80 hover:bg-accent/50",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <CountBadge count={count} />
    </button>
  );
}

/** Collapsible 섹션 헤더 — ChevronRight가 open 시 90° 회전. */
function SectionTrigger({ label }: { label: string }) {
  return (
    <CollapsibleTrigger className="group flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
      <ChevronRight
        className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90"
        aria-hidden
      />
      <span className="flex-1 truncate text-left">{label}</span>
    </CollapsibleTrigger>
  );
}

const FILTER_ROWS: {
  filter: InboxFilter;
  labelKey: TranslationKey;
  icon: React.ReactNode;
  countKey: keyof Pick<InboxCounts, "mine" | "all" | "unread" | "favorites" | "unassigned">;
}[] = [
  {
    filter: { kind: "mine" },
    labelKey: "dashboard.inboxSidebar.mine",
    icon: <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />,
    countKey: "mine",
  },
  {
    filter: { kind: "all" },
    labelKey: "dashboard.inboxSidebar.all",
    icon: <Inbox className="size-4 shrink-0 text-muted-foreground" aria-hidden />,
    countKey: "all",
  },
  {
    filter: { kind: "unread" },
    labelKey: "dashboard.inboxSidebar.unread",
    icon: <MailWarning className="size-4 shrink-0 text-muted-foreground" aria-hidden />,
    countKey: "unread",
  },
  {
    filter: { kind: "favorites" },
    labelKey: "dashboard.inboxSidebar.favorites",
    icon: <Star className="size-4 shrink-0 text-muted-foreground" aria-hidden />,
    countKey: "favorites",
  },
  {
    filter: { kind: "unassigned" },
    labelKey: "dashboard.inboxSidebar.unassigned",
    icon: <UserX className="size-4 shrink-0 text-muted-foreground" aria-hidden />,
    countKey: "unassigned",
  },
];

/**
 * 채널톡 스타일 확장 인박스 사이드바(07 §2).
 * 필터 목록 + 담당자별(접힘) + 상담 태그 트리(펼침). 접힘 상태는 w-10 스트립.
 */
export function InboxSidebar() {
  const { workspace } = useWorkspace();
  const {
    filter,
    setFilter,
    tags,
    counts,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useInboxFilter();

  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    let alive = true;
    void memberApi
      .list(workspace.id)
      .then((items) => {
        if (alive) setMembers(items);
      })
      .catch(() => {
        // 멤버 로드 실패는 조용히 — 담당자별 섹션만 비워둔다.
      });
    return () => {
      alive = false;
    };
  }, [workspace.id]);

  const assigneeCount = useMemo(
    () => new Map((counts?.byAssignee ?? []).map((a) => [a.assigneeId, a.count])),
    [counts],
  );
  const tagCount = useMemo(
    () => new Map((counts?.byTag ?? []).map((t) => [t.tagId, t.count])),
    [counts],
  );
  const { root: rootTags, groups: tagGroups } = useMemo(() => groupTagsByPath(tags), [tags]);

  // ---- 접힌 상태: 얇은 세로 스트립 + 펼치기 버튼 ----
  if (sidebarCollapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              aria-label={td("dashboard.inboxSidebar.expand")}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeftOpen className="size-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{td("dashboard.inboxSidebar.expand")}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  function renderTagRow(tag: Tag, indent: boolean) {
    return (
      <FilterRow
        key={tag.id}
        active={isSameFilter(filter, { kind: "tag", tagId: tag.id })}
        onSelect={() => setFilter({ kind: "tag", tagId: tag.id })}
        icon={
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              TAG_COLOR_CLASSES[tag.color].dot,
            )}
            aria-hidden
          />
        }
        label={tagShortName(tag.name)}
        count={tagCount.get(tag.id)}
        indent={indent}
      />
    );
  }

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* 헤더: 타이틀 + 접기 */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">
          {td("dashboard.inboxSidebar.title")}
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              aria-label={td("dashboard.inboxSidebar.collapse")}
              className="-mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeftClose className="size-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{td("dashboard.inboxSidebar.collapse")}</TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-4">
        {/* 기본 필터 목록 */}
        <div className="space-y-0.5">
          {FILTER_ROWS.map((row) => (
            <FilterRow
              key={row.filter.kind}
              active={isSameFilter(filter, row.filter)}
              onSelect={() => setFilter(row.filter)}
              icon={row.icon}
              label={td(row.labelKey)}
              count={counts?.[row.countKey]}
            />
          ))}
        </div>

        {/* 담당자별 (기본 접힘) */}
        <Collapsible defaultOpen={false} className="border-t border-sidebar-border pt-2">
          <SectionTrigger label={td("dashboard.inboxSidebar.byAssignee")} />
          <CollapsibleContent className="mt-0.5 space-y-0.5">
            {members.map((m) => (
              <FilterRow
                key={m.userId}
                active={isSameFilter(filter, { kind: "assignee", userId: m.userId })}
                onSelect={() => setFilter({ kind: "assignee", userId: m.userId })}
                label={memberLabel(m)}
                count={assigneeCount.get(m.userId)}
                indent
              />
            ))}
          </CollapsibleContent>
        </Collapsible>

        {/* 상담 태그 트리 (기본 펼침) */}
        <Collapsible defaultOpen className="border-t border-sidebar-border pt-2">
          <SectionTrigger label={td("dashboard.inboxSidebar.tags")} />
          <CollapsibleContent className="mt-0.5 space-y-0.5">
            {tags.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {td("dashboard.tags.empty")}
              </p>
            ) : (
              <>
                {rootTags.map((tag) => renderTagRow(tag, false))}
                {[...tagGroups.entries()].map(([group, groupTags]) => (
                  <Collapsible key={group} defaultOpen className="pl-2">
                    <SectionTrigger label={group} />
                    <CollapsibleContent className="mt-0.5 space-y-0.5">
                      {groupTags.map((tag) => renderTagRow(tag, true))}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
