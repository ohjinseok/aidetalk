import { t } from "@aidetalk/i18n";
import { useEffect, useRef } from "preact/hooks";

import type { DisplayItem, TypingState } from "../types";

interface Props {
  items: DisplayItem[];
  localSystemLines: string[];
  typing: TypingState;
  /** 이 손님 메시지 id 밑에 "읽음"을 표시(상담원이 읽은 경우). */
  readReceiptMsgId: string | null;
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

/** 렌더 단위 — 화자 그룹(연속 같은 화자)을 계산하기 위해 순서대로 평탄화한다. */
type Unit =
  | { t: "date"; key: string; label: string }
  | { t: "system"; key: string; text: string }
  | {
      t: "msg";
      key: string;
      /** 그룹핑용 화자 키(visitor / agent_ai / agent_human). pending은 visitor로 묶는다. */
      group: string;
      /** 행 클래스: od-visitor | (od-other od-ai) | (od-other od-human). */
      rowClass: string;
      text: string;
      createdAt: string;
      /** AI 그룹 첫 버블에만 칩을 표시. */
      isAi: boolean;
      showRead: boolean;
      pending: null | { clientMsgId: string; failed: boolean };
    };

/** 말풍선/시스템 라인/날짜 구분선/타이핑 인디케이터 + 화자 그룹핑(06 §2). */
export function MessageList({ items, localSystemLines, typing, readReceiptMsgId, onRetry }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, typing.ai, typing.human, localSystemLines.length]);

  // 1) 렌더 단위로 평탄화.
  const units: Unit[] = [];

  for (const line of localSystemLines) {
    units.push({ t: "system", key: `local-${line}`, text: line });
  }

  let lastDate: string | null = null;
  for (const item of items) {
    const createdAt = item.kind === "confirmed" ? item.message.createdAt : item.pending.createdAt;
    const dk = dateKey(createdAt);
    if (dk !== lastDate) {
      lastDate = dk;
      units.push({ t: "date", key: `date-${dk}`, label: dateLabel(createdAt) });
    }

    if (item.kind === "pending") {
      const p = item.pending;
      units.push({
        t: "msg",
        key: p.clientMsgId,
        group: "visitor",
        rowClass: "od-visitor",
        text: p.text,
        createdAt,
        isAi: false,
        showRead: false,
        pending: { clientMsgId: p.clientMsgId, failed: p.status === "failed" },
      });
      continue;
    }

    const m = item.message;
    if (m.role === "system") {
      units.push({ t: "system", key: m.id, text: m.content.text });
      continue;
    }

    const rowClass =
      m.role === "visitor"
        ? "od-visitor"
        : m.role === "agent_ai"
          ? "od-other od-ai"
          : "od-other od-human";
    units.push({
      t: "msg",
      key: m.id,
      group: m.role,
      rowClass,
      text: m.content.text,
      createdAt: m.createdAt,
      isAi: m.role === "agent_ai",
      showRead: m.role === "visitor" && m.id === readReceiptMsgId,
      pending: null,
    });
  }

  // 2) 렌더 — 화자 그룹의 시작/끝을 인접 단위로 판별.
  const rows: preact.JSX.Element[] = [];
  units.forEach((u, i) => {
    if (u.t === "date") {
      rows.push(
        <div class="od-datebar" key={u.key}>
          {u.label}
        </div>,
      );
      return;
    }
    if (u.t === "system") {
      rows.push(
        <div class="od-row od-system" key={u.key}>
          <div class="od-system-line">{u.text}</div>
        </div>,
      );
      return;
    }

    const prev = units[i - 1];
    const next = units[i + 1];
    const groupStart = !(prev && prev.t === "msg" && prev.group === u.group);
    const groupEnd = !(next && next.t === "msg" && next.group === u.group);
    // 그룹 시작(첫 단위 제외)마다 위 간격을 벌려 화자 전환을 드러낸다.
    const headClass = groupStart && i > 0 ? " od-hd" : "";

    rows.push(
      <div class={`od-row ${u.rowClass}${headClass}`} key={u.key}>
        <div>
          {u.isAi && groupStart ? <span class="od-aichip">{t("widget.aiLabel")}</span> : null}
          {u.pending ? (
            <>
              <div class={`od-bubble od-${u.pending.failed ? "failed" : "pending"}`}>{u.text}</div>
              <div class="od-meta">
                {u.pending.failed ? (
                  <>
                    {t("widget.messageFailed")}
                    <button
                      type="button"
                      class="od-retry"
                      onClick={() => onRetry(u.pending!.clientMsgId)}
                    >
                      {t("widget.messageRetry")}
                    </button>
                  </>
                ) : (
                  t("widget.messagePending")
                )}
              </div>
            </>
          ) : (
            <>
              <div class="od-bubble">{u.text}</div>
              {groupEnd || u.showRead ? (
                <div class="od-meta">
                  {groupEnd ? timeLabel(u.createdAt) : null}
                  {u.showRead ? <span class="od-read">{t("widget.readReceipt")}</span> : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>,
    );
  });

  const showTyping = typing.ai || typing.human;

  return (
    <div class="od-list" ref={ref}>
      {rows}
      {showTyping ? (
        <div class={`od-row od-other ${typing.human ? "od-human" : "od-ai"}`}>
          <div
            class="od-bubble od-other-typing"
            aria-label={t(typing.human ? "widget.typingHuman" : "widget.typingAi")}
          >
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
