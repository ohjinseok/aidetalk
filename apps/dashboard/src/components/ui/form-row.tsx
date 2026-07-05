import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"

/**
 * 폼 한 줄 — 라벨 + 입력 + 선택적 힌트.
 * 기존 Field.FormRow의 API(label, htmlFor?, hint?, children)를 유지한다.
 */
export function FormRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
