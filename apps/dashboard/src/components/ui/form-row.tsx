import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * 폼 한 줄 — 라벨(+선택적 우측 액션) + 입력 + 선택적 힌트.
 * 기존 Field.FormRow API(label, htmlFor?, hint?, children)와 호환.
 * 추가: `action`(라벨 우측 슬롯), `className`(간격 오버라이드용, mb-4 뒤에 병합).
 */
export function FormRow({
  label,
  htmlFor,
  hint,
  action,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mb-4 flex flex-col gap-1.5", className)}>
      {action ? (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={htmlFor}>{label}</Label>
          <div className="shrink-0">{action}</div>
        </div>
      ) : (
        <Label htmlFor={htmlFor}>{label}</Label>
      )}
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
