/**
 * 방문자 아바타 색 유도 — id/이름 문자열을 결정적 해시로 변환해
 * 큐레이션된 파스텔 팔레트에서 하나를 고르고 이니셜을 만든다.
 *
 * 그라데이션은 쓰지 않는다(디자인 방침 — AI 클리셰 금지).
 * 파스텔 단색 배경 + 진한 동색(same-hue) 이니셜. 라이트/다크 각각 보정한다.
 * 순수 함수만 둔다(테스트 대상). 렌더는 components/ui/avatar-visitor.tsx.
 * 방문자마다 색이 고정되면 인박스에서 "같은 손님"을 색으로 식별할 수 있다.
 */

export interface VisitorAvatar {
  /** 배경 단색(라이트) — hsl 문자열. 하위 호환용 별칭(= bg). */
  color: string;
  /** 라이트 배경(파스텔) */
  bg: string;
  /** 라이트 이니셜(진한 동색) */
  fg: string;
  /** 다크 배경(가라앉은 동색) */
  bgDark: string;
  /** 다크 이니셜(밝은 동색) */
  fgDark: string;
  /** 표시용 1글자 이니셜(대문자화된 라틴 또는 첫 글자) */
  initial: string;
}

/**
 * 큐레이션된 8색 hue — 톤은 아래 공식으로 라이트/다크 각각 유도한다(hue만 분산).
 * 파스텔 배경 + 동색 텍스트라 채도/명도는 고정, 색상만 갈린다.
 */
const HUES: readonly number[] = [
  216, // blue
  262, // violet
  174, // teal
  150, // green
  28, // orange
  340, // rose
  196, // cyan
  48, // amber
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

/**
 * seed → hue를 골라 라이트/다크 배경·이니셜 hsl 쌍을 유도. 모듈 내부 전용.
 * 라이트: 파스텔 배경(L 91%) + 진한 동색 이니셜(L 34%).
 * 다크: 가라앉은 배경(L 26%) + 밝은 동색 이니셜(L 78%).
 * 모든 채널은 정수(테스트가 `hsl(\d+ \d+% \d+%)` 형식을 요구).
 */
function avatarPalette(seed: string): Omit<VisitorAvatar, "initial"> {
  const hue = HUES[hashString(seed) % HUES.length]!;
  const bg = `hsl(${hue} 68% 91%)`;
  return {
    color: bg,
    bg,
    fg: `hsl(${hue} 52% 34%)`,
    bgDark: `hsl(${hue} 30% 26%)`,
    fgDark: `hsl(${hue} 58% 78%)`,
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
  return { ...avatarPalette(seed), initial: avatarInitial(label ?? seed) };
}
