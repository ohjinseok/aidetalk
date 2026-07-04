/**
 * widgetSettings 평가 — 04_API_SPEC.md §1(POST /v1/widget/session), 03_DATA_MODEL.md §2.
 * 형태: { primaryColor, greeting, tone, launcherPosition,
 *        officeHours: { enabled, tz, rules: [{ days:[1..7], open:"09:00", close:"18:00" }] },
 *        offHoursMessage }
 * days는 1..7 = 월..일(ISO 요일). tz는 IANA 타임존.
 *
 * TODO(question): officeHours.rules의 open==close 또는 자정 넘김(close < open, 예 22:00~02:00)
 *   해석이 03 문서에 미정. 현재는 [open, close) 반열림·자정 미넘김으로 가정.
 */
import { z } from "zod";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

const officeHoursSchema = z.object({
  enabled: z.boolean().default(false),
  tz: z.string().default("Asia/Seoul"),
  rules: z
    .array(
      z.object({
        days: z.array(z.number().int().min(1).max(7)),
        open: hhmm,
        close: hhmm,
      }),
    )
    .default([]),
});

/** widgetSettings 중 이 서버가 해석하는 필드만 느슨히 파싱. 나머지는 원본 그대로 전달. */
const relevantSchema = z.object({
  greeting: z.string().optional(),
  offHoursMessage: z.string().optional(),
  officeHours: officeHoursSchema.optional(),
});

export interface EvaluatedWidgetSettings extends Record<string, unknown> {
  isOfficeHours: boolean;
}

/**
 * 현재 시각이 운영시간 내인지 평가하고 isOfficeHours를 덧붙여 반환.
 * officeHours가 없거나 enabled=false면 항상 운영시간(true)으로 간주(상시 응대).
 */
export function evaluateWidgetSettings(
  settings: Record<string, unknown>,
  now: Date = new Date(),
): EvaluatedWidgetSettings {
  return { ...settings, isOfficeHours: isOfficeHours(settings, now) };
}

/** 운영시간 판정. 파싱 실패/미설정 시 안전하게 true. */
export function isOfficeHours(settings: Record<string, unknown>, now: Date = new Date()): boolean {
  const parsed = relevantSchema.safeParse(settings);
  const office = parsed.success ? parsed.data.officeHours : undefined;
  if (!office || !office.enabled || office.rules.length === 0) return true;

  const { weekday, minutes } = localWeekdayAndMinutes(now, office.tz);
  for (const rule of office.rules) {
    if (!rule.days.includes(weekday)) continue;
    const open = toMinutes(rule.open);
    const close = toMinutes(rule.close);
    if (minutes >= open && minutes < close) return true;
  }
  return false;
}

/** 그리팅/오프시간 메시지 추출(있을 때만). */
export function extractGreeting(settings: Record<string, unknown>): string | undefined {
  const parsed = relevantSchema.safeParse(settings);
  return parsed.success ? parsed.data.greeting : undefined;
}

export function extractOffHoursMessage(settings: Record<string, unknown>): string | undefined {
  const parsed = relevantSchema.safeParse(settings);
  return parsed.success ? parsed.data.offHoursMessage : undefined;
}

/** tz 기준 요일(1..7, 월..일)과 자정 이후 경과분. */
function localWeekdayAndMinutes(now: Date, tz: string): { weekday: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const weekday = weekdayMap[get("weekday")] ?? 1;
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // 일부 환경의 24시 표기 보정
  const minute = Number(get("minute"));
  return { weekday, minutes: hour * 60 + minute };
}

function toMinutes(hhmmStr: string): number {
  const [h, m] = hhmmStr.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
