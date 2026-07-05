/**
 * 메시지 파이프라인 상태 — 06_WIDGET_SPEC.md §4.1 (테스트 필수 영역).
 *
 * - 낙관적 전송: pending 큐에 추가 → 임시 말풍선.
 * - ack 수신: 해당 clientMsgId pending 제거 + 확정 메시지 upsert.
 * - 중복 ack / 중복 message.new: message.id 기준 upsert로 무시(멱등).
 * - 순서: 확정 메시지는 createdAt asc(동률 시 id) 정렬. pending은 항상 맨 아래.
 *
 * DOM/프레임워크에 의존하지 않는 순수 로직 — 단위 테스트 대상.
 */
import type { DisplayItem, PendingMessage } from "../types";
import type { Message } from "../shared";
import { encodeCursor } from "./cursor";

export class MessageStore {
  private confirmed = new Map<string, Message>();
  private pending: PendingMessage[] = [];

  /** 낙관적 전송 시작 — pending 추가. 이미 있으면(재전송) 상태만 pending으로. */
  addPending(clientMsgId: string, text: string, createdAt: string = new Date().toISOString()): void {
    const existing = this.pending.find((p) => p.clientMsgId === clientMsgId);
    if (existing) {
      existing.status = "pending";
      return;
    }
    this.pending.push({ clientMsgId, text, createdAt, status: "pending" });
  }

  /**
   * message.ack 처리 — pending 제거 후 확정 upsert.
   * 이미 처리된 clientMsgId(재전송으로 서버가 기존 메시지 재ack)여도 message.id upsert가 멱등.
   */
  ack(clientMsgId: string, message: Message): void {
    this.pending = this.pending.filter((p) => p.clientMsgId !== clientMsgId);
    this.confirmed.set(message.id, message);
  }

  /** message.new(상대 메시지 또는 동기화분) — id 기준 upsert. 중복이면 덮어쓰기(무해). */
  upsert(message: Message): void {
    this.confirmed.set(message.id, message);
  }

  /** 여러 메시지 일괄 upsert — GET messages 동기화용. */
  upsertMany(messages: Message[]): void {
    for (const m of messages) this.confirmed.set(m.id, m);
  }

  /** 5초 내 미ack / 전송 실패 → pending 상태를 failed로. */
  markFailed(clientMsgId: string): void {
    const p = this.pending.find((x) => x.clientMsgId === clientMsgId);
    if (p) p.status = "failed";
  }

  /** 재전송 대상 pending(clientMsgId 목록) — 재연결/타임아웃 재전송용. */
  pendingIds(): { clientMsgId: string; text: string }[] {
    return this.pending.map((p) => ({ clientMsgId: p.clientMsgId, text: p.text }));
  }

  hasPending(clientMsgId: string): boolean {
    return this.pending.some((p) => p.clientMsgId === clientMsgId);
  }

  /**
   * 마지막 확정 메시지의 동기화 커서 — 04 §0 형식(base64url of {createdAt, id}).
   * 재연결/폴백 시 GET messages?after={cursor}로 누락분만 받는다.
   * 서버(decodeCursor)가 정본이라 그 인코딩과 1:1로 맞춘다(lib/cursor.ts).
   */
  lastConfirmedCursor(): string | null {
    const sorted = this.sortedConfirmed();
    const last = sorted[sorted.length - 1];
    return last ? encodeCursor(last.createdAt, last.id) : null;
  }

  /** 마지막 확정 메시지(quickReplies 추출 등). */
  lastConfirmed(): Message | null {
    const sorted = this.sortedConfirmed();
    return sorted[sorted.length - 1] ?? null;
  }

  /** 확정 메시지 정렬 목록(created_at asc, 동률 id) — 읽음 표시 계산 등. */
  confirmedList(): Message[] {
    return this.sortedConfirmed();
  }

  private sortedConfirmed(): Message[] {
    return [...this.confirmed.values()].sort((a, b) => {
      if (a.createdAt === b.createdAt) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
  }

  /** 렌더용 통합 목록 — 확정(정렬) 뒤에 pending. */
  displayItems(): DisplayItem[] {
    const items: DisplayItem[] = this.sortedConfirmed().map((message) => ({
      kind: "confirmed" as const,
      message,
    }));
    for (const pending of this.pending) {
      items.push({ kind: "pending", pending });
    }
    return items;
  }

  confirmedCount(): number {
    return this.confirmed.size;
  }

  pendingCount(): number {
    return this.pending.length;
  }
}
