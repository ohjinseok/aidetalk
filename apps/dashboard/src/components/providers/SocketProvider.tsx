"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ServerToDashboardMessage } from "@aidetalk/shared";

import { DashboardSocket, type WsStatus } from "@/lib/ws/client";

interface SocketCtx {
  socket: DashboardSocket;
  status: WsStatus;
  /** 서버→대시보드 이벤트 구독. 컴포넌트 언마운트 시 해제. */
  onEvent: (handler: (msg: ServerToDashboardMessage) => void) => () => void;
}

const Ctx = createContext<SocketCtx | null>(null);

export function useSocket(): SocketCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}

/**
 * WS 연결 수명 관리 — 워크스페이스 진입 시 연결 + subscribe.workspace.
 * 재연결/구독 복원은 DashboardSocket이 담당(04 §5.3).
 */
export function SocketProvider({ wsId, children }: { wsId: string; children: ReactNode }) {
  const socketRef = useRef<DashboardSocket | null>(null);
  if (!socketRef.current) socketRef.current = new DashboardSocket();
  const socket = socketRef.current;
  const [status, setStatus] = useState<WsStatus>("closed");

  useEffect(() => {
    const off = socket.onStatus(setStatus);
    socket.connect();
    socket.subscribeWorkspace(wsId);
    return () => {
      off();
      socket.close();
    };
  }, [socket, wsId]);

  const value = useMemo<SocketCtx>(
    () => ({ socket, status, onEvent: (h) => socket.onEvent(h) }),
    [socket, status],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 이벤트 구독 편의 훅. */
export function useSocketEvent(handler: (msg: ServerToDashboardMessage) => void): void {
  const { onEvent } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onEvent((msg) => ref.current(msg)), [onEvent]);
}
