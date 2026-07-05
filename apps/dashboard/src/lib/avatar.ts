/**
 * 방문자 아바타 색 유도 — id/이름 문자열을 결정적 해시로 변환해
 * 톤이 일관된 HSL 그라디언트 색 쌍과 이니셜을 만든다.
 *
 * 순수 함수만 둔다(테스트 대상). 렌더는 components/ui/avatar-visitor.tsx.
 * 방문자마다 색이 고정되면 인박스에서 "같은 손님"을 색으로 식별할 수 있다.
 */

/** 톤 일관성을 위해 채도·명도는 고정하고 hue만 회전시킨다(선명-차분 사이). */
const SATURATION = 68; // %
const LIGHT_FROM = 60; // %
const LIGHT_TO = 52; // % — to를 조금 어둡게 해 그라디언트에 깊이
const HUE_ROTATE = 30; // deg — from→to 회전각

export interface VisitorAvatar {
  /** linear-gradient 시작색 (hsl 문자열) */
  from: string;
  /** linear-gradient 끝색 (hsl 문자열) */
  to: string;
  /** 표시용 1글자 이니셜(대문자화된 라틴 또는 첫 글자) */
  initial: string;
}

/**
 * FNV-1a 계열의 간단한 결정적 문자열 해시. 항상 32bit 비음수 정수를 반환.
 * 암호학 용도 아님 — 색 분산만 목적.
 */
export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32bit 곱셈(오버플로 방지) — Math.imul.
    hash = Math.imul(hash, 16777619);
  }
  // 부호 제거해 0..2^32-1 범위로.
  return hash >>> 0;
}

/** seed 문자열 → 고정 톤의 { from, to } HSL 그라디언트 색 쌍. */
export function avatarColors(seed: string): { from: string; to: string } {
  const hue = hashString(seed) % 360;
  const hue2 = (hue + HUE_ROTATE) % 360;
  return {
    from: `hsl(${hue} ${SATURATION}% ${LIGHT_FROM}%)`,
    to: `hsl(${hue2} ${SATURATION}% ${LIGHT_TO}%)`,
  };
}

/**
 * 표시 이름(없으면 seed)에서 첫 글자를 뽑아 이니셜로. 라틴은 대문자화.
 * 공백/기호는 건너뛰고 첫 "글자"를 사용. 후보가 없으면 "?".
 */
export function avatarInitial(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  // 유니코드 글자(한글 포함) 우선, 없으면 첫 문자.
  const match = trimmed.match(/[\p{L}\p{N}]/u);
  const ch = match?.[0] ?? trimmed[0] ?? "?";
  return ch.toUpperCase();
}

/**
 * seed(방문자/대화 id 등)로 색을, label(표시 이름)로 이니셜을 유도.
 * label을 생략하면 seed에서 이니셜을 뽑는다.
 */
export function visitorAvatar(seed: string, label?: string): VisitorAvatar {
  const { from, to } = avatarColors(seed);
  return { from, to, initial: avatarInitial(label ?? seed) };
}
