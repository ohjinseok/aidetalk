import type { CSSProperties } from "react";

import { visitorAvatar } from "@/lib/avatar";
import { cn } from "@/lib/utils";

/**
 * 방문자 아바타 — seed(방문자/대화 id)로 색이 고정되는 원형 플랫 단색 마크.
 * 그라데이션 금지(디자인 방침). 파스텔 배경 + 진한 동색 이니셜, 라이트/다크 각각 보정.
 * 옆에 항상 이름 텍스트가 함께 놓이므로 aria-hidden(장식).
 */
interface AvatarVisitorProps {
  /** 색을 결정하는 안정적 키(방문자/대화 id). */
  seed: string;
  /** 이니셜 표시용 이름. 생략 시 seed에서 유도. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

const SIZE_CLASS = {
  sm: "size-6 text-[11px]",
  md: "size-8 text-xs",
} as const;

export function AvatarVisitor({ seed, label, size = "md", className }: AvatarVisitorProps) {
  const { bg, fg, bgDark, fgDark, initial } = visitorAvatar(seed, label);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        "bg-[var(--avatar-bg)] text-[var(--avatar-fg)]",
        "dark:bg-[var(--avatar-bg-dark)] dark:text-[var(--avatar-fg-dark)]",
        SIZE_CLASS[size],
        className,
      )}
      style={
        {
          "--avatar-bg": bg,
          "--avatar-fg": fg,
          "--avatar-bg-dark": bgDark,
          "--avatar-fg-dark": fgDark,
        } as CSSProperties
      }
    >
      {initial}
    </span>
  );
}
