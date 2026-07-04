/**
 * widgetSettings 정본 zod 스키마 — 03_DATA_MODEL.md §2 / 04_API_SPEC.md §1.
 * 서버(저장/평가)·위젯(세션 응답 파싱)·대시보드(설정 폼)가 모두 이 스키마를 단일 출처로 import한다.
 * (CLAUDE.md 코딩 컨벤션: API 계약은 packages/shared의 zod가 단일 출처)
 *
 * 저장 형태(widgetSettingsSchema)와 세션 응답 형태(evaluatedWidgetSettingsSchema)를 구분한다.
 * 세션 응답은 서버가 운영시간 평가 결과 isOfficeHours를 덧붙인다(04 §1).
 */
import { z } from "zod";

/** 응대 톤 — 03 §2. */
export const widgetToneSchema = z.enum(["formal", "casual"]);
export type WidgetTone = z.infer<typeof widgetToneSchema>;

/** 런처 위치 — 기본 우하단, left면 좌하단(06 §2). */
export const launcherPositionSchema = z.enum(["right", "left"]);
export type LauncherPosition = z.infer<typeof launcherPositionSchema>;

/** "HH:mm" 24시간 표기. */
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:mm 형식이어야 한다.");

/** 운영시간 규칙 — days: 1(월)~7(일) ISO 요일, [open, close) 반열림(서버 widget-settings 평가와 1:1). */
export const officeHoursRuleSchema = z.object({
  days: z.array(z.number().int().min(1).max(7)),
  open: hhmm,
  close: hhmm,
});
export type OfficeHoursRule = z.infer<typeof officeHoursRuleSchema>;

/** 운영시간 설정 — tz는 IANA 타임존. */
export const officeHoursSchema = z.object({
  enabled: z.boolean(),
  tz: z.string(),
  rules: z.array(officeHoursRuleSchema),
});
export type OfficeHours = z.infer<typeof officeHoursSchema>;

/**
 * 저장되는 widgetSettings 정본(workspaces.widget_settings jsonb). 모든 필드 optional(기본 {}).
 * 대시보드 설정 폼 / PATCH /settings body / DB 타입의 기준.
 */
export const widgetSettingsSchema = z.object({
  primaryColor: z.string().optional(),
  greeting: z.string().optional(),
  tone: widgetToneSchema.optional(),
  launcherPosition: launcherPositionSchema.optional(),
  officeHours: officeHoursSchema.optional(),
  offHoursMessage: z.string().optional(),
});
export type WidgetSettings = z.infer<typeof widgetSettingsSchema>;

/**
 * 세션 응답(POST /v1/widget/session)의 widgetSettings 형태 — 04 §1.
 * 서버가 운영시간 평가 결과 isOfficeHours를 덧붙인다. 전방호환을 위해 passthrough.
 */
export const evaluatedWidgetSettingsSchema = widgetSettingsSchema
  .extend({ isOfficeHours: z.boolean().optional() })
  .passthrough();
export type EvaluatedWidgetSettings = z.infer<typeof evaluatedWidgetSettingsSchema>;
