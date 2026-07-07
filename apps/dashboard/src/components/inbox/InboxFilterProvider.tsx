"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { ConversationStatus, InboxCounts, Tag } from "@aidetalk/shared";

import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { useInboxCounts } from "@/hooks/useInboxCounts";
import { tagApi } from "@/lib/api/endpoints";

/** 인박스 좌측 사이드바에서 고르는 목록 필터 (URL 쿼리 아님 — 대화 이동에도 유지). */
export type InboxFilter =
  | { kind: "mine" }
  | { kind: "all" }
  | { kind: "unread" }
  | { kind: "favorites" }
  | { kind: "unassigned" }
  | { kind: "assignee"; userId: string }
  | { kind: "tag"; tagId: string };

interface InboxFilterCtx {
  filter: InboxFilter;
  setFilter: (f: InboxFilter) => void;
  status: ConversationStatus;
  setStatus: (s: ConversationStatus) => void;
  /** 워크스페이스 태그 목록 — 사이드바 트리·목록 칩·TagPicker가 공유. */
  tags: Tag[];
  tagById: Map<string, Tag>;
  reloadTags: () => Promise<void>;
  /** 사이드바 카운트 (1초 디바운스 실시간 갱신). */
  counts: InboxCounts | null;
  reloadCounts: () => Promise<void>;
  /** 확장 사이드바 접힘 상태. */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
}

const Ctx = createContext<InboxFilterCtx | null>(null);

export function useInboxFilter(): InboxFilterCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useInboxFilter must be used within InboxFilterProvider");
  return ctx;
}

/** inboxApi.list 쿼리 파라미터로 변환 (InboxList가 사용). */
export function filterToListParams(
  filter: InboxFilter,
): Partial<{ assigneeId: string; tagId: string; unread: boolean; favorite: boolean }> {
  switch (filter.kind) {
    case "mine":
      // "내 상담"은 호출부에서 me.user.id를 assigneeId로 치환한다.
      return {};
    case "all":
      return {};
    case "unread":
      return { unread: true };
    case "favorites":
      return { favorite: true };
    case "unassigned":
      return { assigneeId: "none" };
    case "assignee":
      return { assigneeId: filter.userId };
    case "tag":
      return { tagId: filter.tagId };
  }
}

const SIDEBAR_COLLAPSED_KEY = "aidetalk.inbox.sidebarCollapsed";

/** 인박스 3컬럼(사이드바/목록/뷰)이 공유하는 필터·태그·카운트 상태. inbox layout에서 감싼다. */
export function InboxFilterProvider({ children }: { children: ReactNode }) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const [filter, setFilter] = useState<InboxFilter>({ kind: "all" });
  const [status, setStatus] = useState<ConversationStatus>("open");
  const [tags, setTags] = useState<Tag[]>([]);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const { counts, reload: reloadCounts } = useInboxCounts(workspace.id);

  const reloadTags = useCallback(async () => {
    try {
      setTags(await tagApi.list(workspace.id));
    } catch (err) {
      toast.error(err);
    }
  }, [workspace.id, toast]);

  useEffect(() => {
    void reloadTags();
  }, [reloadTags]);

  // 접힘 상태는 localStorage에 기억 (SSR 불일치 회피를 위해 마운트 후 복원).
  useEffect(() => {
    try {
      setSidebarCollapsedState(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      // storage 접근 불가 환경은 기본값 유지
    }
  }, []);

  const setSidebarCollapsed = useCallback((v: boolean) => {
    setSidebarCollapsedState(v);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      // 무시
    }
  }, []);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const value = useMemo<InboxFilterCtx>(
    () => ({
      filter,
      setFilter,
      status,
      setStatus,
      tags,
      tagById,
      reloadTags,
      counts,
      reloadCounts,
      sidebarCollapsed,
      setSidebarCollapsed,
    }),
    [
      filter,
      status,
      tags,
      tagById,
      reloadTags,
      counts,
      reloadCounts,
      sidebarCollapsed,
      setSidebarCollapsed,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
