"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { agentApi } from "../../lib/api/endpoints";

interface AgentStatusCtx {
  /** 워크스페이스에 status=auto_disabled 커넥터가 하나라도 있는지 — 워크스페이스 셸 배너 표시용. */
  hasAutoDisabledAgent: boolean;
  /** 커넥터 상태 변경(활성화/비활성화) 직후 호출해 배너 상태를 즉시 갱신한다. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<AgentStatusCtx | null>(null);

export function useAgentStatus(): AgentStatusCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAgentStatus must be used within AgentStatusProvider");
  return ctx;
}

/**
 * agents 목록의 auto_disabled 여부를 워크스페이스 셸 전역에서 추적한다(07 §1 배너 규칙).
 * AgentsScreen에서 상태를 바꾼 뒤 refresh()를 호출하면 배너가 새로고침 없이 갱신/소멸된다.
 */
export function AgentStatusProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const [hasAutoDisabledAgent, setHasAutoDisabledAgent] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const agents = await agentApi.list(workspaceId);
      setHasAutoDisabledAgent(agents.some((a) => a.status === "auto_disabled"));
    } catch {
      // 배너는 부가 정보 — 조회 실패는 조용히 무시(메인 화면 로딩을 막지 않음).
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ hasAutoDisabledAgent, refresh }}>{children}</Ctx.Provider>;
}
