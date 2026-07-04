/**
 * 위젯 로컬 타입.
 *
 * widgetSettings 정본 zod는 packages/shared(widget-settings.ts)로 승격됨 — 여기서는 재노출만 한다.
 * 세션 응답(POST /session)의 widgetSettings는 서버가 isOfficeHours를 덧붙인 evaluated 형태다(04 §1).
 */
import {
  evaluatedWidgetSettingsSchema,
  type EvaluatedWidgetSettings,
} from "@aidetalk/shared";

import type { Message, Visitor } from "./shared";

/** 세션 응답에 실리는 widgetSettings(평가 결과 isOfficeHours 포함). shared 정본 재노출. */
export const widgetSettingsSchema = evaluatedWidgetSettingsSchema;
export type WidgetSettings = EvaluatedWidgetSettings;

/** 위젯 초기화 설정 — 로더가 window.AideTalk로 넘긴다. */
export interface WidgetConfig {
  workspaceId: string;
  serverUrl: string;
}

/** 낙관적(pending) 로컬 메시지 — 아직 서버 ack 전. */
export interface PendingMessage {
  clientMsgId: string;
  text: string;
  createdAt: string;
  status: "pending" | "failed";
}

/** 화면 렌더용 통합 메시지 항목. */
export type DisplayItem =
  | { kind: "confirmed"; message: Message }
  | { kind: "pending"; pending: PendingMessage };

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "online"
  | "reconnecting"
  | "polling"
  | "offline";

export type WidgetPhase = "idle" | "booting" | "ready" | "error";

export interface TypingState {
  ai: boolean;
  human: boolean;
}

export interface WidgetState {
  phase: WidgetPhase;
  open: boolean;
  settings: WidgetSettings | null;
  visitor: Visitor | null;
  conversationId: string | null;
  /** 확정 메시지(서버) — id 기준 upsert, createdAt 정렬. */
  confirmed: Message[];
  /** 미확정 로컬 메시지 — 항상 목록 맨 아래. */
  pending: PendingMessage[];
  connection: ConnectionStatus;
  typing: TypingState;
  unread: number;
  /** 이메일 프롬프트: 첫 메시지 전송 후 1회 노출. */
  emailPromptVisible: boolean;
  emailCaptured: boolean;
  error: string | null;
}
