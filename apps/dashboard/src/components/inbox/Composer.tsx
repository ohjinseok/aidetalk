"use client";

import { useState, type KeyboardEvent } from "react";

import { td } from "../../lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * 답장 컴포저 — 07 §2.2.
 * value는 상위(ConversationView)가 소유(어시스트 draft 주입 대비).
 * mode=ai면 전송 시 자동 human 전환 힌트를 입력창 위에 표시.
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
      {showModeHint ? (
        <p className="mb-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
          {td("dashboard.conversation.modeSwitchHint")}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <Textarea
          aria-label={td("dashboard.conversation.composerPlaceholder")}
          placeholder={td("dashboard.conversation.composerPlaceholder")}
          className="max-h-40 min-h-[44px] resize-y"
          rows={2}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button disabled={!canSend} onClick={() => void send()}>
          {td("dashboard.conversation.send")}
        </Button>
      </div>
    </div>
  );
}
