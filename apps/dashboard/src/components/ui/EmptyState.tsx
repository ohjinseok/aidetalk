import type { ReactNode } from "react";

/** 각 목록 첫 화면(07 §6). title + 선택적 설명/액션. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description ? <p className="max-w-sm text-sm text-gray-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
