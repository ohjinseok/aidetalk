"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PanelRight } from "lucide-react";

import type { Conversation, Suggestion } from "@aidetalk/shared";

import { inboxApi, assistApi } from "@/lib/api/endpoints";
import { td, tf } from "@/lib/i18n";
import { readReceiptMsgId as computeReadReceiptMsgId } from "@/lib/readReceipt";
import { mergeTimeline, upsertMessage } from "@/lib/timeline";
import { useConversation } from "@/hooks/useConversation";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { AvatarVisitor } from "@/components/ui/avatar-visitor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { AiChip } from "./AiChip";
import { AssistPanel } from "./AssistPanel";
import { Composer } from "./Composer";
import { Timeline, type TrackedMap } from "./Timeline";
import { VisitorPanel } from "./VisitorPanel";

// Radix Select는 빈 문자열 value를 허용하지 않아 "담당자 미지정"에 센티넬 값을 쓴다.
const UNASSIGNED = "__unassigned__";

export function ConversationView({ convId }: { convId: string }) {
  const { workspace } = useWorkspace();
  const wsId = workspace.id;
  const isS1 = workspace.segment === "s1_site";
  const toast = useToast();

  // 대화 데이터(초기 로드 fetch + 소켓 구독/이벤트)는 useConversation이 소유.
  const {
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
  } = useConversation(convId, wsId, isS1);

  // 컴포저·편집 상태는 화면 로컬 — 대화 전환 시 초기화.
  const [composer, setComposer] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(true);

  useEffect(() => {
    setComposer("");
    setEditingId(null);
  }, [convId]);

  // ---- 파생 ----
  const timeline = useMemo(() => mergeTimeline(messages, detail?.events ?? []), [messages, detail]);

  const trackedMap: TrackedMap = useMemo(() => {
    const map: TrackedMap = new Map();
    for (const l of tracking?.trackedLinks ?? []) {
      if (l.messageId) map.set(l.messageId, { clickedAt: l.clickedAt });
    }
    return map;
  }, [tracking]);

  // 상담원이 보낸 마지막 메시지 밑에 "읽음"을 표시할 대상 id(순수 로직은 lib/readReceipt).
  const readReceiptMsgId = useMemo(
    () => computeReadReceiptMsgId(messages, visitorLastReadId),
    [messages, visitorLastReadId],
  );

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
      // ai였다면 서버가 human으로 전환 — 낙관적 반영
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
        <header className="flex h-13 items-center justify-between gap-2 border-b border-border bg-card px-4">
          <div className="flex min-w-0 items-center gap-2">
            <AvatarVisitor
              seed={convId}
              label={detail.visitor.name || detail.visitor.email || undefined}
              size="sm"
            />
            <span className="truncate text-sm font-semibold">
              {detail.visitor.name ||
                detail.visitor.email ||
                tf("dashboard.inbox.anonymousVisitor", { id: detail.visitor.id.slice(-4) })}
            </span>
            <Badge variant={conversation.status === "closed" ? "secondary" : "warning"}>
              {td(statusKey)}
            </Badge>
            {/* AI 응대 중 — 지금 기계가 응대함을 "AI" 모노그램 칩으로. */}
            {!modeHuman ? <AiChip /> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select
              value={conversation.assigneeId ?? UNASSIGNED}
              onValueChange={(v) => void onAssign(v === UNASSIGNED ? null : v)}
            >
              <SelectTrigger
                className="h-8 w-36 text-[13px]"
                aria-label={td("dashboard.conversation.assign")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>
                  {td("dashboard.conversation.assignPlaceholder")}
                </SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.userId}>
                    {m.name || m.email || m.userId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {modeHuman ? (
              <Button variant="outline" size="sm" onClick={() => void onReturnToAi()}>
                {td("dashboard.conversation.returnToAi")}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void onToggleClose()}>
              {conversation.status === "closed"
                ? td("dashboard.conversation.reopen")
                : td("dashboard.conversation.close")}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={td("dashboard.conversation.togglePanel")}
              aria-pressed={showInfo}
              onClick={() => setShowInfo((v) => !v)}
            >
              <PanelRight className="size-4" aria-hidden />
            </Button>
          </div>
        </header>

        {/* 스레드 — 순백 표면 위에서 버블이 산다. */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-card">
          <Timeline
            items={timeline}
            wsId={wsId}
            tracked={trackedMap}
            readReceiptMsgId={readReceiptMsgId}
          />
        </div>

        {/* 손님 입력 중 표시 */}
        {visitorTyping ? (
          <div className="px-4 py-1 text-xs text-muted-foreground">
            {td("dashboard.conversation.visitorTyping")}
          </div>
        ) : null}

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
          onPiiDeleted={() =>
            setDetail((d) =>
              d
                ? {
                    ...d,
                    visitor: {
                      ...d.visitor,
                      name: null,
                      email: null,
                      phone: null,
                      attributes: {},
                    },
                  }
                : d,
            )
          }
        />
      ) : null}
    </div>
  );
}
