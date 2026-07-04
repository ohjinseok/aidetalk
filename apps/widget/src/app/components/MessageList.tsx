import { t } from "@aidetalk/i18n";
import { useEffect, useRef } from "preact/hooks";

import type { DisplayItem, TypingState } from "../types";

interface Props {
  items: DisplayItem[];
  localSystemLines: string[];
  typing: TypingState;
  onRetry: (clientMsgId: string) => void;
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (dateKey(iso) === dateKey(today.toISOString())) return t("widget.dateToday");
  if (dateKey(iso) === dateKey(y.toISOString())) return t("widget.dateYesterday");
  return d.toLocaleDateString();
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** 말풍선/시스템 라인/날짜 구분선/타이핑 인디케이터(06 §2). */
export function MessageList({ items, localSystemLines, typing, onRetry }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, typing.ai, typing.human, localSystemLines.length]);

  let lastDate: string | null = null;
  const rows: preact.JSX.Element[] = [];

  for (const line of localSystemLines) {
    rows.push(
      <div class="od-row od-system" key={`local-${line}`}>
        <div class="od-system-line">{line}</div>
      </div>,
    );
  }

  for (const item of items) {
    const createdAt = item.kind === "confirmed" ? item.message.createdAt : item.pending.createdAt;
    const dk = dateKey(createdAt);
    if (dk !== lastDate) {
      lastDate = dk;
      rows.push(
        <div class="od-datebar" key={`date-${dk}`}>
          {dateLabel(createdAt)}
        </div>,
      );
    }

    if (item.kind === "pending") {
      const p = item.pending;
      rows.push(
        <div class="od-row od-visitor" key={p.clientMsgId}>
          <div>
            <div class={`od-bubble od-${p.status === "failed" ? "failed" : "pending"}`}>{p.text}</div>
            <div class="od-meta">
              {p.status === "failed" ? (
                <>
                  {t("widget.messageFailed")}
                  <button type="button" class="od-retry" onClick={() => onRetry(p.clientMsgId)}>
                    {t("widget.messageRetry")}
                  </button>
                </>
              ) : (
                t("widget.messagePending")
              )}
            </div>
          </div>
        </div>,
      );
      continue;
    }

    const m = item.message;
    if (m.role === "system") {
      rows.push(
        <div class="od-row od-system" key={m.id}>
          <div class="od-system-line">{m.content.text}</div>
        </div>,
      );
      continue;
    }
    const side = m.role === "visitor" ? "visitor" : "other";
    rows.push(
      <div class={`od-row od-${side}`} key={m.id}>
        <div>
          <div class="od-bubble">{m.content.text}</div>
          <div class="od-meta">{timeLabel(m.createdAt)}</div>
        </div>
      </div>,
    );
  }

  const showTyping = typing.ai || typing.human;

  return (
    <div class="od-list" ref={ref}>
      {rows}
      {showTyping ? (
        <div class="od-row od-other">
          <div class="od-bubble od-other-typing" aria-label={t(typing.human ? "widget.typingHuman" : "widget.typingAi")}>
            <div class="od-typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
