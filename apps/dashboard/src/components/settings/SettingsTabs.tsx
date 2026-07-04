"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

import { td, type TranslationKey } from "../../lib/i18n";

const TABS: { seg: string; labelKey: TranslationKey }[] = [
  { seg: "widget", labelKey: "dashboard.nav.widget" },
  { seg: "members", labelKey: "dashboard.nav.members" },
  { seg: "workspace", labelKey: "dashboard.nav.workspace" },
];

/** 설정 하위 탭 — 07 §5 (위젯/멤버/워크스페이스). */
export function SettingsTabs() {
  const params = useParams<{ wsId: string }>();
  const pathname = usePathname();
  const base = `/w/${params.wsId}/settings`;

  return (
    <nav className="flex gap-1 border-b border-gray-200 bg-white px-6" aria-label={td("dashboard.nav.settings")}>
      {TABS.map((tab) => {
        const href = `${base}/${tab.seg}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.seg}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 px-3 py-2.5 text-sm ${
              active ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {td(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
