"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { InboxCounts } from "@aidetalk/shared";

import { useSocketEvent } from "@/components/providers/SocketProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { inboxApi } from "@/lib/api/endpoints";

const DEBOUNCE_MS = 1000;

/** useInboxCounts가 돌려주는 상태. */
export interface InboxCountsState {
  counts: InboxCounts | null;
  reload: () => Promise<void>;
}

/**
 * 인박스 필터 탭/사이드바 카운트(내 담당/전체/미열람/즐겨찾기/미배정/태그별) 로드 + 실시간 갱신.
 * inbox.upsert/conversation.updated 수신 시마다 매번 refetch하면 다건 브로드캐스트에 요청이
 * 폭주하므로 1초 디바운스로 묶어서 재조회한다(useResource.ts와 달리 이벤트 트리거라 별도 훅으로 분리).
 */
export function useInboxCounts(wsId: string): InboxCountsState {
  const toast = useToast();
  const [counts, setCounts] = useState<InboxCounts | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      setCounts(await inboxApi.counts(wsId));
    } catch (err) {
      toast.error(err);
    }
  }, [wsId, toast]);

  // 최초 로드 + wsId 변경 시 재조회.
  useEffect(() => {
    void reload();
  }, [reload]);

  // 언마운트 시 대기 중인 디바운스 타이머 정리.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleReload = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void reload();
    }, DEBOUNCE_MS);
  }, [reload]);

  useSocketEvent((msg) => {
    if (msg.type === "inbox.upsert" || msg.type === "conversation.updated") {
      scheduleReload();
    }
  });

  return { counts, reload };
}
