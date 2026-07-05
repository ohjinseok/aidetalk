"use client";

import { useState, type KeyboardEvent } from "react";

import { SendHorizontal } from "lucide-react";

import { td } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiChip } from "./AiChip";

/**
 * 답장 컴포저 — 07 §2.2.
 * value는 상위(ConversationView)가 소유(어시스트 draft 주입 대비).
 * mode=ai면 입력창 상단에 "AI 응대 중" 상태 라인을 붙여, 전송 시 사람 모드로
 * 전환됨을 화자 문법("AI" 모노그램 칩 + 인디고)으로 예고한다.
 */
export function Composer({
  value,
  onChange,
  onSend,
  showModeHint,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  showModeHint: boolean;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const canSend = value.trim().length > 0 && !busy && !disabled;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    try {
      await onSend();
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="border-t border-border bg-card p-3">
      {/* 입력 통합 컨테이너 — 상태 라인·입력·전송을 하나의 표면으로 묶는다. */}
      <div className="overflow-hidden rounded-xl border bg-card transition-shadow focus-within:border-ring/40 focus-within:ring-1 focus-within:ring-ring/40">
        {showModeHint ? (
          <div className="flex items-center gap-1.5 border-b border-primary/15 bg-primary/5 px-3 py-1.5 text-xs text-primary">
            <AiChip />
            <span>{td("dashboard.conversation.modeSwitchHint")}</span>
          </div>
        ) : null}
        <Textarea
          aria-label={td("dashboard.conversation.composerPlaceholder")}
          placeholder={td("dashboard.conversation.composerPlaceholder")}
          className="max-h-40 min-h-[44px] resize-none border-none bg-transparent shadow-none focus-visible:ring-0"
          rows={2}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="flex justify-end px-2 pb-2">
          <Button size="sm" disabled={!canSend} onClick={() => void send()}>
            <SendHorizontal className="size-4" aria-hidden />
            {td("dashboard.conversation.send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
