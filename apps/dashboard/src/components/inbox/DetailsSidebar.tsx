"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ChevronDown } from "lucide-react";

import type {
  Conversation,
  ConversationDetail,
  ConversationTracking,
  Member,
  Message,
  Suggestion,
  VisitorDetail,
} from "@aidetalk/shared";

import { td } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssistPanel } from "./AssistPanel";
import { AssignSection } from "./panels/AssignSection";
import { ConversationInfoSection } from "./panels/ConversationInfoSection";
import { CustomerInfoSection } from "./panels/CustomerInfoSection";
import { LinksSection } from "./panels/LinksSection";
import { NotesSection } from "./panels/NotesSection";
import { RevenueSection } from "./panels/RevenueSection";
import { VisitorConversationsSection } from "./panels/VisitorConversationsSection";

const SECTION_KEY_PREFIX = "aidetalk.inbox.section.";

/**
 * 아코디언 섹션의 접힘 상태를 localStorage에 기억한다.
 * SSR 불일치 회피를 위해 초기값은 defaultOpen, 마운트 후 저장값으로 복원.
 */
export function useStickyOpen(name: string, defaultOpen: boolean): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const v = localStorage.getItem(SECTION_KEY_PREFIX + name);
      if (v === "1") setOpen(true);
      else if (v === "0") setOpen(false);
    } catch {
      // storage 접근 불가 환경은 기본값 유지
    }
  }, [name]);
  const set = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(SECTION_KEY_PREFIX + name, v ? "1" : "0");
    } catch {
      // 무시
    }
  };
  return [open, set];
}

/**
 * 우측 상세 패널의 아코디언 섹션 셸 — 채널톡 스타일.
 * 헤더(text-xs font-semibold + 회전 셰브론) 클릭으로 접힘, 상태는 localStorage에 기억.
 */
export function DetailsSection({
  name,
  title,
  defaultOpen = true,
  right,
  children,
}: {
  /** localStorage 키 접미사 — 섹션마다 고유. */
  name: string;
  title: string;
  defaultOpen?: boolean;
  /** 헤더 우측 슬롯(예: 카운트, 추가 버튼). */
  right?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useStickyOpen(name, defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border">
      <div className="flex items-center gap-1 px-4 py-2.5">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open ? "" : "-rotate-90",
            )}
            aria-hidden
          />
          <span className="truncate text-xs font-semibold text-foreground">{title}</span>
        </CollapsibleTrigger>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <CollapsibleContent>
        <div className="px-4 pb-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * 우측 상세 패널(정보/어시스트 탭) — 07 §2.2, 채널톡 스타일 아코디언.
 * 정보 탭은 섹션 스택, 어시스트 탭은 AssistPanel(mode=human 전용, 규칙 9).
 */
export function DetailsSidebar({
  wsId,
  convId,
  isS1,
  detail,
  conversation,
  members,
  messages,
  tracking,
  tagIds,
  onSetTagIds,
  onAssign,
  onVisitorUpdated,
  onPiiDeleted,
  suggestions,
  dimmed,
  acceptRate,
  onAccept,
  onEdit,
  onIgnore,
  onInsertLink,
}: {
  wsId: string;
  convId: string;
  isS1: boolean;
  detail: ConversationDetail;
  conversation: Conversation;
  members: Member[];
  messages: Message[];
  tracking: ConversationTracking | null;
  tagIds: string[];
  onSetTagIds: (next: string[]) => void;
  onAssign: (userId: string | null) => void;
  onVisitorUpdated: (v: VisitorDetail) => void;
  onPiiDeleted: () => void;
  suggestions: Suggestion[];
  dimmed: Set<string>;
  acceptRate: number | null;
  onAccept: (s: Suggestion) => void;
  onEdit: (s: Suggestion) => void;
  onIgnore: (s: Suggestion) => void;
  onInsertLink: (url: string) => void;
}) {
  const modeHuman = conversation.mode === "human";
  // 새 제안 카운트 — 어시스트 탭 뱃지(아직 결정 안 된 pending).
  const pendingCount = suggestions.filter((s) => s.outcome === "pending").length;

  const infoSections = (
    <>
      <AssignSection conversation={conversation} members={members} onAssign={onAssign} />
      <ConversationInfoSection
        conversation={conversation}
        tagIds={tagIds}
        onSetTagIds={onSetTagIds}
      />
      <CustomerInfoSection
        wsId={wsId}
        visitor={detail.visitor}
        conversation={conversation}
        onVisitorUpdated={onVisitorUpdated}
        onPiiDeleted={onPiiDeleted}
      />
      <NotesSection wsId={wsId} convId={convId} />
      <VisitorConversationsSection
        wsId={wsId}
        visitorId={detail.visitor.id}
        currentConvId={convId}
      />
      <LinksSection messages={messages} />
      {isS1 ? <RevenueSection tracking={tracking} /> : null}
    </>
  );

  // AI 모드에서는 어시스트 탭을 숨기고 정보 섹션만 노출.
  if (!modeHuman) {
    return (
      <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-background">
        <div className="min-h-0 flex-1 overflow-y-auto">{infoSections}</div>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-background">
      <Tabs defaultValue="info" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b border-border bg-card px-3 py-2">
          <TabsList variant="pill" className="w-full">
            <TabsTrigger value="info">{td("dashboard.conversation.tabInfo")}</TabsTrigger>
            <TabsTrigger value="assist" className="gap-1.5">
              {td("dashboard.conversation.tabAssist")}
              {pendingCount > 0 ? (
                <Badge variant="warning" className="px-1.5 py-0 text-[10px] tabular-nums">
                  {pendingCount}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="info" className="min-h-0 flex-1 overflow-y-auto">
          {infoSections}
        </TabsContent>
        <TabsContent value="assist" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AssistPanel
            suggestions={suggestions}
            dimmed={dimmed}
            acceptRate={acceptRate}
            onAccept={onAccept}
            onEdit={onEdit}
            onIgnore={onIgnore}
            onInsertLink={onInsertLink}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
