"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { toast as sonnerToast } from "sonner";

import { ApiError } from "../../lib/api/client";
import { errorMessage } from "../../lib/errors";
import { td } from "../../lib/i18n";

type ToastKind = "success" | "error";

interface ToastApi {
  toast: (kind: ToastKind, message: string) => void;
  success: (message?: string) => void;
  /** ApiError code → i18n 매핑(07 §6). */
  error: (err: unknown) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

/**
 * 토스트 컨텍스트 — 렌더는 sonner(<Toaster/>는 루트 layout에 마운트)에 위임한다.
 * useToast() API(toast/success/error)는 그대로 유지.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const api = useMemo<ToastApi>(
    () => ({
      toast: (kind, message) => {
        if (kind === "error") sonnerToast.error(message);
        else sonnerToast.success(message);
      },
      success: (message) => sonnerToast.success(message ?? td("dashboard.common.saved")),
      error: (err) => {
        const code = err instanceof ApiError ? err.code : undefined;
        sonnerToast.error(errorMessage(code));
      },
    }),
    [],
  );

  return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>;
}
