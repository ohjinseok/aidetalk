"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Conversation, Message, Suggestion } from "@aidetalk/shared";

import { assistApi, inboxApi, memberApi, trackingApi } from "../../lib/api/endpoints";
import { td } from "../../lib/i18n";
import type { ConversationDetail, ConversationTracking, Member } from "../../lib/api/schemas";
import { mergeTimeline } from "../../lib/timeline";
import { upsertMessage } from "../../lib/timeline";
import { useSocketEvent, useSocket } from "../providers/SocketProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { useToast } from "../providers/ToastProvider";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Select } from "../ui/Field";
import { Spinner } from "../ui/Spinner";
import { AssistPanel } from "./AssistPanel";
import { Composer } from "./Composer";
import { Timeline, type TrackedMap } from "./Timeline";
import { VisitorPanel } from "./VisitorPanel";

export function ConversationView({ convId }: { convId: string }) {
  const { workspace } = useWorkspace();
  const wsId = workspace.id;
  const isS1 = workspace.segment === "s1_site";
  const toast = useToast();
  const { socket } = useSocket();

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tracking, setTracking] = useState<ConversationTracking | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dimmed, setDimmed] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(true);
  const [loading, setLoading] = useState(true);

  // ---- 초기 로드 ----
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDetail(null);
    setMessages([]);
    setSuggestions([]);
    setComposer("");
    setEditingId(null);

    async function load() {
      try {
        const d = await inboxApi.get(wsId, convId);
        if (!alive) return;
        setDetail(d);
        setConversation(d.conversation);

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

  useSocketEvent((msg) => {
    if (msg.type === "message.new") {
      const m = msg.payload.message;
      if (m.conversationId !== convId) return;
      setMessages((prev) => upsertMessage(prev, m));
      // 손님 새 메시지 → 이전 pending 카드 dim(07 §2.3)
      if (m.role === "visitor") {
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
    }
  });

  // ---- 파생 ----
  const timeline = useMemo(
    () => mergeTimeline(messages, detail?.events ?? []),
    [messages, detail],
  );

  const trackedMap: TrackedMap = useMemo(() => {
    const map: TrackedMap = new Map();
    for (const l of tracking?.trackedLinks ?? []) {
      if (l.messageId) map.set(l.messageId, { clickedAt: l.clickedAt });
    }
    return map;
  }, [tracking]);

  const acceptRate = useMemo(() => {
    const decided = suggestions.filter((s) => s.outcome !== "pending");
    if (decided.length === 0) return null;
    const good = decided.filter((s) => s.outcome === "accepted" || s.outcome === "edited").length;
    return good / decided.length;
  }, [suggestions]);

  // ---- 액션 ----
  const patchConv = useCallback((c: Conversation) => setConversation(c), []);

  const doSend = useCallback(async () => {
    const text = composer.trim();
    if (!text || !conversation) return;
    try {
      const created = await inboxApi.sendMessage(wsId, convId, text);
      setMessages((prev) => upsertMessage(prev, created));
      setComposer("");
      // 편집 제안 전송 → outcome=edited(07 §2.3)
      if (editingId) {
        const id = editingId;
        setEditingId(null);
        assistApi
          .setOutcome(wsId, id, "edited")
          .then((s) => setSuggestions((prev) => prev.map((x) => (x.id === s.id ? s : x))))
          .catch(() => undefined);
      }
      // ai였다면 서버가 human으로 전환(120줄) — 낙관적 반영
      if (conversation.mode === "ai") {
        setConversation({ ...conversation, mode: "human" });
      }
    } catch (err) {
      toast.error(err);
    }
  }, [composer, conversation, wsId, convId, editingId, toast]);

  const onAssign = useCallback(
    async (userId: string | null) => {
      try {
        patchConv(await inboxApi.assign(wsId, convId, userId));
      } catch (err) {
        toast.error(err);
      }
    },
    [wsId, convId, patchConv, toast],
  );

  const onReturnToAi = useCallback(async () => {
    try {
      patchConv(await inboxApi.returnToAi(wsId, convId));
    } catch (err) {
      toast.error(err);
    }
  }, [wsId, convId, patchConv, toast]);

  const onToggleClose = useCallback(async () => {
    if (!conversation) return;
    try {
      const c =
        conversation.status === "closed"
          ? await inboxApi.reopen(wsId, convId)
          : await inboxApi.close(wsId, convId);
      patchConv(c);
    } catch (err) {
      toast.error(err);
    }
  }, [conversation, wsId, convId, patchConv, toast]);

  // 어시스트 카드 핸들러
  const onAccept = useCallback(
    async (s: Suggestion) => {
      try {
        const created = await inboxApi.sendMessage(wsId, convId, s.draft);
        setMessages((prev) => upsertMessage(prev, created));
        const updated = await assistApi.setOutcome(wsId, s.id, "accepted");
        setSuggestions((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        if (conversation?.mode === "ai") setConversation({ ...conversation, mode: "human" });
      } catch (err) {
        toast.error(err);
      }
    },
    [wsId, convId, conversation, toast],
  );

  const onEdit = useCallback((s: Suggestion) => {
    setComposer(s.draft);
    setEditingId(s.id);
  }, []);

  const onIgnore = useCallback(
    async (s: Suggestion) => {
      try {
        const updated = await assistApi.setOutcome(wsId, s.id, "ignored");
        setSuggestions((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } catch (err) {
        toast.error(err);
      }
    },
    [wsId, toast],
  );

  const onInsertLink = useCallback((url: string) => {
    setComposer((prev) => (prev ? `${prev} ${url}` : url));
  }, []);

  if (loading || !conversation || !detail) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const modeHuman = conversation.mode === "human";
  const statusKey =
    conversation.status === "closed"
      ? "dashboard.conversation.statusClosed"
      : conversation.status === "pending"
        ? "dashboard.conversation.statusPending"
        : "dashboard.conversation.statusOpen";

  return (
    <div className="flex h-full">
      {/* 중앙 컬럼 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 헤더 */}
        <header className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">
              {detail.visitor.name || detail.visitor.email || convId.slice(-6)}
            </span>
            <Badge tone={modeHuman ? "green" : "indigo"}>
              {modeHuman
                ? td("dashboard.conversation.modeBadgeHuman")
                : td("dashboard.conversation.modeBadgeAi")}
            </Badge>
            <Badge tone={conversation.status === "closed" ? "gray" : "yellow"}>{td(statusKey)}</Badge>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select
              aria-label={td("dashboard.conversation.assign")}
              value={conversation.assigneeId ?? ""}
              onChange={(e) => void onAssign(e.target.value || null)}
              className="w-40"
            >
              <option value="">{td("dashboard.conversation.assignPlaceholder")}</option>
              {members.map((m) => (
                <option key={m.id} value={m.userId}>
                  {m.name || m.email || m.userId}
                </option>
              ))}
            </Select>
            {modeHuman ? (
              <Button variant="secondary" size="sm" onClick={() => void onReturnToAi()}>
                {td("dashboard.conversation.returnToAi")}
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => void onToggleClose()}>
              {conversation.status === "closed"
                ? td("dashboard.conversation.reopen")
                : td("dashboard.conversation.close")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={td("dashboard.conversation.togglePanel")}
              onClick={() => setShowInfo((v) => !v)}
            >
              ℹ️
            </Button>
          </div>
        </header>

        {/* 스레드 */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
          <Timeline items={timeline} wsId={wsId} tracked={trackedMap} />
        </div>

        {/* 컴포저 */}
        <Composer
          value={composer}
          onChange={setComposer}
          onSend={doSend}
          showModeHint={!modeHuman}
        />
      </div>

      {/* 어시스트(사람 모드 전용) */}
      {modeHuman ? (
        <AssistPanel
          suggestions={suggestions}
          dimmed={dimmed}
          acceptRate={acceptRate}
          onAccept={onAccept}
          onEdit={onEdit}
          onIgnore={onIgnore}
          onInsertLink={onInsertLink}
        />
      ) : null}

      {/* 정보 패널 */}
      {showInfo ? (
        <VisitorPanel
          visitor={detail.visitor}
          conversation={conversation}
          tracking={tracking}
          isS1={isS1}
        />
      ) : null}
    </div>
  );
}
