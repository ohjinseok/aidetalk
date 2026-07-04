import { td } from "../../lib/i18n";

/** 로딩 스피너. 접근성: role=status + 스크린리더용 라벨. */
export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-gray-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand" />
      <span className="sr-only">{label ?? td("dashboard.common.loading")}</span>
    </span>
  );
}
