/**
 * 날짜/시간 포맷 — 07_DASHBOARD_SPEC §6.
 * "라이브러리 없이 Intl API만" (번들 절약). 로케일 기본 ko.
 */

/** 두 시각이 같은 로컬 날짜인지. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * 메시지/이벤트 시각 표시.
 * - 오늘: "HH:mm"
 * - 그 외: "M월 d일" (ko), 다른 로케일은 short 날짜.
 */
export function formatMessageTime(iso: string, now: Date = new Date(), locale = "ko"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isSameDay(d, now)) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  }
  if (locale === "ko") {
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(d);
}

/** "HH:mm"만 (링크 클릭 시각 등). */
export function formatHm(iso: string, locale = "ko"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * 상대시간 — 인박스 목록용. Intl.RelativeTimeFormat으로 로컬라이즈(하드코딩 회피).
 * 예: "방금 전"(<60s는 0분), "5분 전", "2시간 전", "3일 전".
 */
export function formatRelativeTime(iso: string, now: Date = new Date(), locale = "ko"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = d.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diffMs);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return rtf.format(0, "minute");
  if (abs < hour) return rtf.format(Math.round(diffMs / min), "minute");
  if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(diffMs / day), "day");
  // 30일 이상은 절대 날짜로.
  return formatMessageTime(iso, now, locale);
}

/** 원화 표기. */
export function formatKrw(amount: number, locale = "ko"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}
