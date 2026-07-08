"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

import { ApiError } from "@/lib/api/client";
import { authApi, workspaceApi } from "@/lib/api/endpoints";
import { td } from "@/lib/i18n";
import type { Me, Membership, Workspace } from "@aidetalk/shared";
import { useResource } from "@/hooks/useResource";
import { Spinner } from "@/components/ui/spinner";

interface WorkspaceCtx {
  me: Me;
  workspace: Workspace;
  membership: Membership;
  /** owner 여부 — owner 전용 액션 게이팅. */
  isOwner: boolean;
  refreshWorkspace: () => Promise<void>;
}

/** useResource로 로드하는 원본 데이터 — refreshWorkspace 등 파생 필드는 렌더 시점에 합성한다. */
interface WorkspaceData {
  me: Me;
  workspace: Workspace;
  membership: Membership;
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
  const [error, setError] = useState<string | null>(null);

  const { data, setData } = useResource<WorkspaceData | null>(
    async () => {
      const me = await authApi.me();
      const membership = me.memberships.find((m) => m.workspaceId === wsId);
      if (!membership) {
        const first = me.memberships[0];
        router.replace(first ? `/w/${first.workspaceId}/inbox` : "/onboarding");
        // 리다이렉트 진행 중 — data는 초기값(null)에 머물러 스피너를 계속 보여준다.
        return null;
      }
      const workspace = await workspaceApi.get(wsId);
      return { me, workspace, membership };
    },
    null,
    [wsId, router],
    {
      onError: (err) => {
        if (err instanceof ApiError && err.httpStatus === 401) {
          router.replace("/login");
          return;
        }
        setError(td("dashboard.common.errorGeneric"));
      },
    },
  );

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const ctxValue: WorkspaceCtx = {
    me: data.me,
    workspace: data.workspace,
    membership: data.membership,
    isOwner: data.membership.role === "owner",
    refreshWorkspace: async () => {
      const fresh = await workspaceApi.get(wsId);
      setData((d) => (d ? { ...d, workspace: fresh } : d));
    },
  };

  return <Ctx.Provider value={ctxValue}>{children}</Ctx.Provider>;
}
