"use client";

import { useParams } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { SocketProvider } from "@/components/providers/SocketProvider";
import { WorkspaceProvider } from "@/components/providers/WorkspaceProvider";

/**
 * 워크스페이스 스코프 레이아웃 — 07 §1.
 * 클라이언트 컴포넌트로 useParams()에서 wsId를 읽는다(Next 15 params Promise 회피).
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ wsId: string }>();
  const wsId = params.wsId;

  return (
    <WorkspaceProvider wsId={wsId}>
      <SocketProvider wsId={wsId}>
        <AppShell>{children}</AppShell>
      </SocketProvider>
    </WorkspaceProvider>
  );
}
