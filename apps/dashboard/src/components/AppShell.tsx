"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { authApi } from "../lib/api/endpoints";
import { td, type TranslationKey } from "../lib/i18n";
import { AutoDisabledBanner } from "./AutoDisabledBanner";
import { AgentStatusProvider } from "./providers/AgentStatusProvider";
import { useSocket } from "./providers/SocketProvider";
import { useWorkspace } from "./providers/WorkspaceProvider";

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: string;
  match: string;
  hidden?: boolean;
}

/** 좌측 얇은 내비 + 상단 워크스페이스 스위처(07 §1). */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, workspace, membership } = useWorkspace();
  const { status } = useSocket();
  const pathname = usePathname();
  const router = useRouter();
  const base = `/w/${workspace.id}`;
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // S2(사이트 없음)는 트래킹 라우트/네비 자체 숨김 — CLAUDE.md 규칙 10.
  const items: NavItem[] = [
    { href: `${base}/inbox`, labelKey: "dashboard.nav.inbox", icon: "💬", match: "/inbox" },
    {
      href: `${base}/tracking`,
      labelKey: "dashboard.nav.tracking",
      icon: "📈",
      match: "/tracking",
      hidden: workspace.segment === "s2_no_site",
    },
    { href: `${base}/agents`, labelKey: "dashboard.nav.agents", icon: "🔌", match: "/agents" },
    {
      href: `${base}/settings/widget`,
      labelKey: "dashboard.nav.settings",
      icon: "⚙️",
      match: "/settings",
    },
  ];

  async function onLogout() {
    try {
      await authApi.logout();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <AgentStatusProvider workspaceId={workspace.id}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* 좌측 내비 */}
        <nav
          className="flex w-16 flex-col items-center gap-1 border-r border-gray-200 bg-white py-3"
          aria-label={td("dashboard.nav.settings")}
        >
          <div className="mb-2 text-xl" aria-hidden>
            🗨️
          </div>
          {items
            .filter((i) => !i.hidden)
            .map((item) => {
              const active = pathname.startsWith(`${base}${item.match}`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={td(item.labelKey)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full flex-col items-center gap-0.5 py-2 text-[10px] ${
                    active ? "text-brand" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <span className="text-lg" aria-hidden>
                    {item.icon}
                  </span>
                  {td(item.labelKey)}
                </Link>
              );
            })}
          <div className="mt-auto">
            <button
              onClick={onLogout}
              aria-label={td("dashboard.nav.logout")}
              className="flex w-full flex-col items-center gap-0.5 py-2 text-[10px] text-gray-500 hover:text-gray-800"
            >
              <span className="text-lg" aria-hidden>
                🚪
              </span>
              {td("dashboard.nav.logout")}
            </button>
          </div>
        </nav>

        {/* 본문 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 상단 바 */}
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
            <div className="relative">
              <button
                onClick={() => setSwitcherOpen((v) => !v)}
                aria-label={td("dashboard.nav.switchWorkspace")}
                aria-expanded={switcherOpen}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold hover:bg-gray-100"
              >
                {workspace.name}
                <span className="text-xs text-gray-400" aria-hidden>
                  ▾
                </span>
              </button>
              {switcherOpen ? (
                <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  {me.memberships.map((m) => (
                    <Link
                      key={m.workspaceId}
                      href={`/w/${m.workspaceId}/inbox`}
                      onClick={() => setSwitcherOpen(false)}
                      className={`block px-3 py-2 text-sm hover:bg-gray-50 ${
                        m.workspaceId === workspace.id ? "font-semibold text-brand" : "text-gray-700"
                      }`}
                    >
                      {m.workspaceName}
                    </Link>
                  ))}
                  <Link
                    href="/onboarding"
                    onClick={() => setSwitcherOpen(false)}
                    className="mt-1 block border-t border-gray-100 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                  >
                    + {td("dashboard.onboarding.title")}
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span
                className={`inline-flex items-center gap-1 ${status === "open" ? "text-green-600" : "text-gray-400"}`}
                aria-live="polite"
              >
                <span
                  className={`h-2 w-2 rounded-full ${status === "open" ? "bg-green-500" : "bg-gray-300"}`}
                  aria-hidden
                />
                {status === "open" ? "" : td("dashboard.common.loading")}
              </span>
              <span>{me.user.name}</span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5">
                {td(membership.role === "owner" ? "dashboard.members.roleOwner" : "dashboard.members.roleAgent")}
              </span>
            </div>
          </header>

          <AutoDisabledBanner />

          <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        </div>
      </div>
    </AgentStatusProvider>
  );
}
