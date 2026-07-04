/**
 * 위젯 로컬 타입 + widgetSettings 스키마.
 *
 * TODO(question): widgetSettings의 정본 zod 스키마는 03_DATA_MODEL.md §2 주석상
 * `packages/shared/widget-settings.ts`에 두기로 되어 있으나 아직 미존재.
 * 서버 확정 전까지 위젯 로컬 스키마로 느슨히(passthrough) 파싱한다.
 * shared에 스키마가 생기면 이 파일을 제거하고 그쪽을 import 할 것.
 */
import { z } from "zod";

import type { Message, Visitor } from "./shared";

/** 운영시간 규칙 — 서버가 isOfficeHours로 평가하지만 원본도 통과시킨다. */
const officeHoursSchema = z
  .object({
    enabled: z.boolean().optional(),
    tz: z.string().optional(),
    rules: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const widgetSettingsSchema = z
  .object({
    primaryColor: z.string().optional(),
    greeting: z.string().optional(),
    tone: z.enum(["formal", "casual"]).optional(),
    launcherPosition: z.enum(["right", "left"]).optional(),
    officeHours: officeHoursSchema.optional(),
    offHoursMessage: z.string().optional(),
    /** 서버가 세션 응답에 주입하는 운영시간 평가 결과(04 §1). */
    isOfficeHours: z.boolean().optional(),
    /** 헤더 표기용 워크스페이스 이름(있으면 사용). */
    workspaceName: z.string().optional(),
  })
  .passthrough();

export type WidgetSettings = z.infer<typeof widgetSettingsSchema>;

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
