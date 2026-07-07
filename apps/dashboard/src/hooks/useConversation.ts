"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type {
  Conversation,
  ConversationDetail,
  ConversationTracking,
  Member,
  Message,
  Suggestion,
} from "@aidetalk/shared";

import { useSocket, useSocketEvent } from "@/components/providers/SocketProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { assistApi, inboxApi, memberApi, trackingApi } from "@/lib/api/endpoints";
import { upsertMessage } from "@/lib/timeline";

/** useConversation이 소유하는 대화 데이터 상태 + 액션이 갱신할 수 있는 setter들. */
export interface ConversationState {
  detail: ConversationDetail | null;
  setDetail: Dispatch<SetStateAction<ConversationDetail | null>>;
  conversation: Conversation | null;
  setConversation: Dispatch<SetStateAction<Conversation | null>>;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  members: Member[];
  tracking: ConversationTracking | null;
  suggestions: Suggestion[];
  setSuggestions: Dispatch<SetStateAction<Suggestion[]>>;
  /** 손님이 읽은 마지막 메시지 id — "읽음" 표시 계산에 사용. */
  visitorLastReadId: string | null;
  visitorTyping: boolean;
  /** 손님 새 메시지로 무효화된 pending 제안 카드 id 집합. */
  dimmed: Set<string>;
  loading: boolean;
  /** 즐겨찾기 여부 — detail 로드 전에는 false(detail.favorite 파생). */
  favorite: boolean;
  /** 태그 id 목록 — detail 로드 전에는 빈 배열(detail.tagIds 파생). */
  tagIds: string[];
  /**
   * 즐겨찾기 토글 — 낙관적 업데이트 후 서버 반영, 실패 시 롤백 + 토스트.
   * 메모(notes)는 패널 컴포넌트가 noteApi를 직접 쓰므로 여기 넣지 않는다.
   */
  toggleFavorite: () => Promise<void>;
  /** 태그 id 목록을 통째로 교체 — 이전 목록과 diff해 addTag/removeTag 호출(낙관적 업데이트, 실패 시 롤백). */
  setTagIds: (next: string[]) => Promise<void>;
}

/**
 * 대화 상세의 초기 로드 fetch + 소켓 구독/이벤트 반영을 한 훅으로 분리(07 §2).
 * ConversationView의 렌더·액션 로직은 그대로 두고, 데이터 소유만 여기로 옮긴다(동작 불변).
 */
export function useConversation(convId: string, wsId: string, isS1: boolean): ConversationState {
  const toast = useToast();
  const { socket } = useSocket();

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tracking, setTracking] = useState<ConversationTracking | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // 양방향 읽음 표시(read receipts): 손님이 읽은 마지막 메시지 id + 손님 타이핑 상태.
  const [visitorLastReadId, setVisitorLastReadId] = useState<string | null>(null);
  const [visitorTyping, setVisitorTyping] = useState(false);
  const [dimmed, setDimmed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // ---- 초기 로드 ----
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDetail(null);
    setMessages([]);
    setSuggestions([]);

    async function load() {
      try {
        const d = await inboxApi.get(wsId, convId);
        if (!alive) return;
        setDetail(d);
        setConversation(d.conversation);
        setVisitorLastReadId(d.conversation.visitorLastReadMessageId ?? null);
        setVisitorTyping(false);

        const msgs = await inboxApi.messages(wsId, convId, { limit: 50 });
        if (!alive) return;
        setMessages(msgs.items);

        // 담당자 드롭다운용 멤버
        memberApi
          .list(wsId)
          .then((m) => alive && setMembers(m))
          .catch(() => undefined);

        // 어시스트(사람 모드)
        if (d.conversation.mode === "human") {
          assistApi
            .list(wsId, convId, {})
            .then((s) => alive && setSuggestions(s.items))
            .catch(() => undefined);
        }

        // 전환 트래킹(S1)
        if (isS1) {
          trackingApi
            .conversation(wsId, convId)
            .then((t) => alive && setTracking(t))
            .catch(() => undefined);
        }
      } catch (err) {
        if (alive) toast.error(err);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [wsId, convId, isS1, toast]);

  // ---- 구독 ----
  useEffect(() => {
    socket.subscribeConversation(convId);
    return () => socket.unsubscribeConversation(convId);
  }, [socket, convId]);

  // ---- 열람/새 메시지 시 읽음 처리(read.mark) ----
  // 상담원이 이 대화를 보고 있으면 마지막 메시지를 읽음 처리 → 손님에게 "읽음" 표시.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last) socket.markRead(convId, last.id);
  }, [socket, convId, messages]);

  useSocketEvent((msg) => {
    if (msg.type === "message.new") {
      const m = msg.payload.message;
      if (m.conversationId !== convId) return;
      setMessages((prev) => upsertMessage(prev, m));
      // 손님 새 메시지 → 이전 pending 카드 dim(07 §2.3)
      if (m.role === "visitor") {
        setVisitorTyping(false);
        setSuggestions((cur) => {
          setDimmed((prev) => {
            const next = new Set(prev);
            for (const s of cur) if (s.outcome === "pending") next.add(s.id);
            return next;
          });
          return cur;
        });
      }
    } else if (msg.type === "conversation.updated") {
      if (msg.payload.conversation.id === convId) setConversation(msg.payload.conversation);
    } else if (msg.type === "suggestion.new") {
      const s = msg.payload.suggestion;
      if (s.conversationId === convId) setSuggestions((prev) => [s, ...prev]);
    } else if (msg.type === "read.update") {
      // 손님이 읽음 처리 → 상담원 마지막 메시지에 "읽음" 표시(by="agent"는 내 자신 → 무시).
      if (msg.payload.conversationId === convId && msg.payload.by === "visitor") {
        setVisitorLastReadId(msg.payload.lastMessageId);
      }
    } else if (msg.type === "typing.start" || msg.type === "typing.stop") {
      // 손님 타이핑만 "입력 중…"으로 표시(ai/human은 상담원 화면에 불필요).
      if (msg.payload.conversationId === convId && msg.payload.by === "visitor") {
        setVisitorTyping(msg.type === "typing.start");
      }
    }
  });

  // ---- 즐겨찾기/태그: detail 파생 상태 + 낙관적 업데이트 액션 ----
  const favorite = detail?.favorite ?? false;
  const tagIds = detail?.tagIds ?? [];

  const toggleFavorite = useCallback(async () => {
    if (!detail) return;
    const prev = detail.favorite ?? false;
    const next = !prev;
    setDetail((d) => (d ? { ...d, favorite: next } : d));
    try {
      const confirmed = await inboxApi.setFavorite(wsId, convId, next);
      setDetail((d) => (d ? { ...d, favorite: confirmed } : d));
    } catch (err) {
      setDetail((d) => (d ? { ...d, favorite: prev } : d));
      toast.error(err);
    }
  }, [detail, wsId, convId, toast]);

  const setTagIdsAction = useCallback(
    async (next: string[]) => {
      if (!detail) return;
      const prev = detail.tagIds ?? [];
      setDetail((d) => (d ? { ...d, tagIds: next } : d));
      const toAdd = next.filter((id) => !prev.includes(id));
      const toRemove = prev.filter((id) => !next.includes(id));
      try {
        let latest = next;
        for (const tagId of toAdd) {
          latest = await inboxApi.addTag(wsId, convId, tagId);
        }
        for (const tagId of toRemove) {
          latest = await inboxApi.removeTag(wsId, convId, tagId);
        }
        setDetail((d) => (d ? { ...d, tagIds: latest } : d));
      } catch (err) {
        setDetail((d) => (d ? { ...d, tagIds: prev } : d));
        toast.error(err);
      }
    },
    [detail, wsId, convId, toast],
  );

  return {
    detail,
    setDetail,
    conversation,
    setConversation,
    messages,
    setMessages,
    members,
    tracking,
    suggestions,
    setSuggestions,
    visitorLastReadId,
    visitorTyping,
    dimmed,
    loading,
    favorite,
    tagIds,
    toggleFavorite,
    setTagIds: setTagIdsAction,
  };
}
