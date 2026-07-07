import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const WIDTHS = {
  /** 설정류 — 읽기 폭 좁게 */
  narrow: "max-w-3xl",
  /** 목록/대시보드류 */
  default: "max-w-4xl",
  /** 스탯 그리드·2컬럼 레이아웃 */
  wide: "max-w-6xl",
} as const;

/**
 * 콘텐츠 페이지 공통 셸 — 최대 폭 + 여백을 통일한다 (07 §1).
 * 인박스(전폭 4컬럼)를 제외한 모든 페이지가 사용.
 */
export function PageShell({
  width = "default",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={cn("mx-auto w-full px-8 py-8", WIDTHS[width], className)}>{children}</div>
    </div>
  );
}

/**
 * 페이지 헤더 — 타이틀·설명 좌측, 주요 액션 우측.
 * 모든 콘텐츠 페이지 최상단에 두어 화면의 목적을 먼저 말해준다.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * 설정 섹션 카드 — 헤더(제목+설명) / 본문 / 푸터(우측 정렬 액션, 옅은 배경) 3단.
 * Stripe식 설정 화면 단위. 위험 구역은 `danger`로 경계·제목을 destructive 톤으로.
 */
export function SectionCard({
  title,
  description,
  danger = false,
  footer,
  className,
  contentClassName,
  children,
}: {
  title: string;
  description?: string;
  danger?: boolean;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs",
        danger && "border-destructive/30",
        className,
      )}
    >
      <div className="border-b border-border/60 px-6 py-4">
        <h2 className={cn("text-sm font-semibold", danger && "text-destructive")}>{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className={cn("px-6 py-5", contentClassName)}>{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/40 px-6 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
