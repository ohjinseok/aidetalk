"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { ApiError } from "@/lib/api/client";
import { authApi, workspaceApi } from "@/lib/api/endpoints";
import { td } from "@/lib/i18n";
import type { Me, Membership, Workspace } from "@/lib/api/schemas";
import { Spinner } from "@/components/ui/spinner";

interface WorkspaceCtx {
  me: Me;
  workspace: Workspace;
  membership: Membership;
  /** owner 여부 — owner 전용 액션 게이팅. */
  isOwner: boolean;
  refreshWorkspace: () => Promise<void>;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

/**
 * 워크스페이스 컨텍스트 — /v1/me + 워크스페이스 로드, membership 검증(07 §1).
 * 미인증 → /login, 멤버 아님 → 첫 워크스페이스 또는 온보딩.
 */
export function WorkspaceProvider({ wsId, children }: { wsId: string; children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<WorkspaceCtx | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const me = await authApi.me();
        const membership = me.memberships.find((m) => m.workspaceId === wsId);
        if (!membership) {
          const first = me.memberships[0];
          router.replace(first ? `/w/${first.workspaceId}/inbox` : "/onboarding");
          return;
        }
        const workspace = await workspaceApi.get(wsId);
        if (!alive) return;
        setState({
          me,
          workspace,
          membership,
          isOwner: membership.role === "owner",
          refreshWorkspace: async () => {
            const fresh = await workspaceApi.get(wsId);
            if (alive) setState((s) => (s ? { ...s, workspace: fresh } : s));
          },
        });
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.httpStatus === 401) {
          router.replace("/login");
          return;
        }
        setError(td("dashboard.common.errorGeneric"));
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [wsId, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
