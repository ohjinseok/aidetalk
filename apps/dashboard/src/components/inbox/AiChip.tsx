import { td } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * "AI" 모노그램 칩 — AI 화자를 타이포그래피로 표기한다.
 * 반짝이(Sparkles) 계열 아이콘·이모지 금지 방침에 따라, AI 표시는 이 칩 하나로만 한다.
 * 인박스 화자 문법 전용 로컬 컴포넌트. 다른 화면에서 필요해지면 다음 웨이브가 `ui/`로 승격.
 */
export function AiChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border border-primary/30 px-1 text-[10px] font-semibold leading-4 text-primary",
        className,
      )}
    >
      {td("dashboard.inbox.modeAi")}
    </span>
  );
}
