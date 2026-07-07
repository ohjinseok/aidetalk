"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { td, type TranslationKey } from "@/lib/i18n";

const TABS: { seg: string; labelKey: TranslationKey }[] = [
  { seg: "widget", labelKey: "dashboard.nav.widget" },
  { seg: "members", labelKey: "dashboard.nav.members" },
  { seg: "workspace", labelKey: "dashboard.nav.workspace" },
  { seg: "webhooks", labelKey: "dashboard.nav.webhooks" },
];

/**
 * 설정 하위 탭 — 07 §5 (위젯/멤버/워크스페이스/웹훅).
 * pill 세그먼트(옅은 트랙 + 선택 항목은 흰 카드처럼 떠 보이게) — Tabs pill 변형과 동일 룩.
 * 페이지 콘텐츠 폭 안에서 렌더링되어 헤더/카드와 좌측 정렬이 맞는다.
 */
export function SettingsTabs() {
  const params = useParams<{ wsId: string }>();
  const pathname = usePathname();
  const base = `/w/${params.wsId}/settings`;

  return (
    <nav
      aria-label={td("dashboard.nav.settings")}
      className="mb-6 inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full bg-muted p-[3px]"
    >
      {TABS.map((tab) => {
        const href = `${base}/${tab.seg}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.seg}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all",
              active
                ? "bg-background text-foreground shadow-sm dark:bg-input/30"
                : "text-foreground/60 hover:text-foreground",
            )}
          >
            {td(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
