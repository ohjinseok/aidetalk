"use client";

import {
  Check,
  ChevronsUpDown,
  Inbox,
  LogOut,
  MessagesSquare,
  Monitor,
  Moon,
  Plug,
  Plus,
  Settings,
  Sun,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { avatarInitial } from "../lib/avatar";
import { authApi } from "../lib/api/endpoints";
import { td, type TranslationKey } from "../lib/i18n";
import { AutoDisabledBanner } from "./AutoDisabledBanner";
import { AgentStatusProvider } from "./providers/AgentStatusProvider";
import { useSocket } from "./providers/SocketProvider";
import { useWorkspace } from "./providers/WorkspaceProvider";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

/** 워크스페이스 이니셜 마크 — primary 톤 정사각 배지(그라디언트 방문자 아바타와 구분). */
function WorkspaceMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary"
    >
      {avatarInitial(name)}
    </span>
  );
}

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  match: string;
  hidden?: boolean;
}

/** 상단바 우측 테마 토글 — 시스템/라이트/다크 (next-themes). */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={td("dashboard.theme.toggle")}
          className="text-muted-foreground"
        >
          {/* CSS 전환으로 하이드레이션 깜빡임 회피 */}
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuCheckboxItem checked={theme === "system"} onCheckedChange={() => setTheme("system")}>
          <Monitor className="size-4" />
          {td("dashboard.theme.system")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={theme === "light"} onCheckedChange={() => setTheme("light")}>
          <Sun className="size-4" />
          {td("dashboard.theme.light")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={theme === "dark"} onCheckedChange={() => setTheme("dark")}>
          <Moon className="size-4" />
          {td("dashboard.theme.dark")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 좌측 얇은 내비 + 상단 워크스페이스 스위처(07 §1). */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, workspace, membership } = useWorkspace();
  const { status } = useSocket();
  const pathname = usePathname();
  const router = useRouter();
  const base = `/w/${workspace.id}`;

  // S2(사이트 없음)는 트래킹 라우트/네비 자체 숨김 — CLAUDE.md 규칙 10.
  const items: NavItem[] = [
    { href: `${base}/inbox`, labelKey: "dashboard.nav.inbox", icon: Inbox, match: "/inbox" },
    {
      href: `${base}/tracking`,
      labelKey: "dashboard.nav.tracking",
      icon: TrendingUp,
      match: "/tracking",
      hidden: workspace.segment === "s2_no_site",
    },
    { href: `${base}/agents`, labelKey: "dashboard.nav.agents", icon: Plug, match: "/agents" },
    {
      href: `${base}/settings/widget`,
      labelKey: "dashboard.nav.settings",
      icon: Settings,
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
    <TooltipProvider>
      <AgentStatusProvider workspaceId={workspace.id}>
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
          {/* 좌측 내비(레일) — 아이콘 전용, 레이블은 우측 툴팁으로 이동. */}
          <nav className="flex w-16 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3">
            <div
              className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              aria-hidden
            >
              <MessagesSquare className="size-5" />
            </div>
            {items
              .filter((i) => !i.hidden)
              .map((item) => {
                const active = pathname.startsWith(`${base}${item.match}`);
                const Icon = item.icon;
                const label = td(item.labelKey);
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        aria-label={label}
                        aria-current={active ? "page" : undefined}
                        className={`relative flex size-10 items-center justify-center rounded-lg transition-colors ${
                          active
                            ? "bg-accent text-primary"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                        }`}
                      >
                        {/* 좌측 활성 인디케이터 */}
                        {active && (
                          <span
                            className="absolute left-0 h-5 w-0.5 rounded-full bg-primary"
                            aria-hidden
                          />
                        )}
                        <Icon className="size-5" aria-hidden />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                );
              })}
            <div className="mt-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onLogout}
                    aria-label={td("dashboard.nav.logout")}
                    className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                  >
                    <LogOut className="size-5" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{td("dashboard.nav.logout")}</TooltipContent>
              </Tooltip>
            </div>
          </nav>

          {/* 본문 */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* 상단 바 */}
            <header className="flex h-13 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={td("dashboard.nav.switchWorkspace")}
                    className="gap-2 pl-1.5"
                  >
                    <WorkspaceMark name={workspace.name} />
                    <span className="text-sm font-medium">{workspace.name}</span>
                    <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  {me.memberships.map((m) => {
                    const current = m.workspaceId === workspace.id;
                    return (
                      <DropdownMenuItem key={m.workspaceId} asChild>
                        <Link href={`/w/${m.workspaceId}/inbox`} className="gap-2">
                          <WorkspaceMark name={m.workspaceName} />
                          <span className={current ? "font-medium text-foreground" : undefined}>
                            {m.workspaceName}
                          </span>
                          {current && <Check className="ml-auto size-4 text-primary" aria-hidden />}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/onboarding" className="text-muted-foreground">
                      <Plus className="size-4" aria-hidden />
                      {td("dashboard.onboarding.title")}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={`inline-flex items-center gap-1 ${status === "open" ? "text-green-600 dark:text-green-500" : "text-muted-foreground"}`}
                  aria-live="polite"
                >
                  <span
                    className={`size-2 rounded-full ${status === "open" ? "bg-green-500" : "bg-muted-foreground/40"}`}
                    aria-hidden
                  />
                  {status === "open" ? "" : td("dashboard.common.loading")}
                </span>
                <span className="text-sm text-foreground">{me.user.name}</span>
                <Badge variant="secondary">
                  {td(membership.role === "owner" ? "dashboard.members.roleOwner" : "dashboard.members.roleAgent")}
                </Badge>
                <ThemeToggle />
              </div>
            </header>

            <AutoDisabledBanner />

            <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
          </div>
        </div>
      </AgentStatusProvider>
    </TooltipProvider>
  );
}
