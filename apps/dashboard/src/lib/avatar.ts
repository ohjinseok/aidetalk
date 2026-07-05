/**
 * 방문자 아바타 색 유도 — id/이름 문자열을 결정적 해시로 변환해
 * 큐레이션된 플랫 단색 팔레트에서 하나를 고르고 이니셜을 만든다.
 *
 * 그라데이션은 쓰지 않는다(디자인 방침). 순수 함수만 둔다(테스트 대상).
 * 렌더는 components/ui/avatar-visitor.tsx.
 * 방문자마다 색이 고정되면 인박스에서 "같은 손님"을 색으로 식별할 수 있다.
 */

export interface VisitorAvatar {
  /** 배경 단색 (hsl 문자열) */
  color: string;
  /** 표시용 1글자 이니셜(대문자화된 라틴 또는 첫 글자) */
  initial: string;
}

/**
 * 큐레이션된 플랫 팔레트 — 채도를 낮춘 차분한 8색(hue만 분산, 톤 고정).
 * 흰 이니셜 대비를 위해 명도는 중간 이하로 유지.
 */
const PALETTE: readonly string[] = [
  "hsl(216 55% 52%)", // blue
  "hsl(255 45% 58%)", // violet
  "hsl(174 45% 40%)", // teal
  "hsl(150 40% 42%)", // green
  "hsl(24 60% 50%)", // orange
  "hsl(340 50% 55%)", // rose
  "hsl(196 55% 44%)", // cyan
  "hsl(45 55% 44%)", // amber
];

/**
 * FNV-1a 계열의 간단한 결정적 문자열 해시. 항상 32bit 비음수 정수를 반환.
 * 암호학 용도 아님 — 색 분산만 목적. 모듈 내부 전용(공개 API는 visitorAvatar).
 */
function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32bit 곱셈(오버플로 방지) — Math.imul.
    hash = Math.imul(hash, 16777619);
  }
  // 부호 제거해 0..2^32-1 범위로.
  return hash >>> 0;
}

/** seed 문자열 → 팔레트에서 결정적으로 선택된 단색. 모듈 내부 전용. */
function avatarColor(seed: string): string {
  return PALETTE[hashString(seed) % PALETTE.length]!;
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
  return { color: avatarColor(seed), initial: avatarInitial(label ?? seed) };
}
