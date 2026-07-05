import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";
import { td } from "@/lib/i18n";

/**
 * 로딩 스피너 — lucide Loader 기반.
 * 접근성: role=status + sr-only 라벨(i18n). 하드코딩 문자열 금지(CLAUDE.md 규칙 4).
 */
function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)}
    >
      <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
      <span className="sr-only">{label ?? td("dashboard.common.loading")}</span>
    </span>
  );
}

export { Spinner };
