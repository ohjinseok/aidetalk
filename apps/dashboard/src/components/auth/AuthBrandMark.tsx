import { MessagesSquare } from "lucide-react";

/**
 * 인증/온보딩 화면군 상단 브랜드 마크.
 * AppShell 좌측 레일의 로고 마크(bg-primary 정사각 rounded-lg + MessagesSquare)와
 * 동일한 스타일을 이 화면군 전용으로 재현한다 — AppShell을 직접 import하지 않는다.
 */
export function AuthBrandMark() {
  return (
    <div
      className="mx-auto mb-4 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"
      aria-hidden
    >
      <MessagesSquare className="size-5" />
    </div>
  );
}
