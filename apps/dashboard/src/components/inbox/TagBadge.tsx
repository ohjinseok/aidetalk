"use client";

import { X } from "lucide-react";

import type { Tag } from "@aidetalk/shared";

import { td } from "@/lib/i18n";
import { TAG_COLOR_CLASSES, tagShortName } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";

/**
 * 상담 태그 칩 — 단색 플랫(옅은 배경 + 진한 동색 텍스트).
 * `full`이면 경로 전체("결제/환불"), 아니면 마지막 세그먼트만 표시.
 */
export function TagBadge({
  tag,
  full = false,
  onRemove,
  className,
}: {
  tag: Tag;
  full?: boolean;
  onRemove?: () => void;
  className?: string;
}) {
  const color = TAG_COLOR_CLASSES[tag.color] ?? TAG_COLOR_CLASSES.gray;
  return (
    <span
      className={cn(
        "inline-flex max-w-40 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        color.chip,
        className,
      )}
      title={tag.name}
    >
      <span className="truncate">{full ? tag.name : tagShortName(tag.name)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={td("dashboard.common.delete")}
          className="-mr-0.5 rounded-sm opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-3" aria-hidden />
        </button>
      )}
    </span>
  );
}
