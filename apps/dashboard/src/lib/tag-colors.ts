import type { TagColor } from "@aidetalk/shared";

/**
 * 태그 팔레트 10색 → Tailwind 클래스 단일 매핑 (단일 출처).
 * 단색 플랫(옅은 배경 + 진한 동색 텍스트)만 사용 — 그라데이션 금지(디자인 규칙).
 * 라이트/다크 쌍을 함께 정의해 소비처는 이 맵만 참조한다.
 */
export const TAG_COLOR_CLASSES: Record<TagColor, { chip: string; dot: string }> = {
  gray: {
    chip: "bg-zinc-100 text-zinc-700 dark:bg-zinc-400/15 dark:text-zinc-300",
    dot: "bg-zinc-400 dark:bg-zinc-500",
  },
  red: {
    chip: "bg-red-50 text-red-700 dark:bg-red-400/15 dark:text-red-300",
    dot: "bg-red-500",
  },
  orange: {
    chip: "bg-orange-50 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
    dot: "bg-orange-500",
  },
  amber: {
    chip: "bg-amber-50 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  green: {
    chip: "bg-green-50 text-green-700 dark:bg-green-400/15 dark:text-green-300",
    dot: "bg-green-500",
  },
  teal: {
    chip: "bg-teal-50 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
    dot: "bg-teal-500",
  },
  blue: {
    chip: "bg-blue-50 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  indigo: {
    chip: "bg-indigo-50 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
    dot: "bg-indigo-500",
  },
  purple: {
    chip: "bg-purple-50 text-purple-700 dark:bg-purple-400/15 dark:text-purple-300",
    dot: "bg-purple-500",
  },
  pink: {
    chip: "bg-pink-50 text-pink-700 dark:bg-pink-400/15 dark:text-pink-300",
    dot: "bg-pink-500",
  },
};

/** 태그 이름의 `/` 경로형 표기에서 마지막 세그먼트(표시용 짧은 이름)를 얻는다. */
export function tagShortName(name: string): string {
  const seg = name.split("/").at(-1)?.trim();
  return seg && seg.length > 0 ? seg : name;
}

/**
 * 플랫 태그 목록을 `/` 구분자로 트리 그룹핑한다 (DB는 플랫 유지 — 07 문서 참조).
 * 1단계 그룹만 지원: "결제/환불" → 그룹 "결제" 하위 "환불". 구분자 없는 태그는 루트에.
 */
export function groupTagsByPath<T extends { name: string }>(
  tags: T[],
): { root: T[]; groups: Map<string, T[]> } {
  const root: T[] = [];
  const groups = new Map<string, T[]>();
  for (const tag of tags) {
    const idx = tag.name.indexOf("/");
    if (idx <= 0) {
      root.push(tag);
      continue;
    }
    const group = tag.name.slice(0, idx).trim();
    const list = groups.get(group) ?? [];
    list.push(tag);
    groups.set(group, list);
  }
  return { root, groups };
}
