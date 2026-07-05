"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { td } from "@/lib/i18n";

/**
 * 파괴적 액션 확인(07 §6) — 내부는 shadcn AlertDialog. 콜사이트 props는 유지한다.
 * Esc/취소로 닫으면 onCancel, 확인 버튼은 onConfirm.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? td("dashboard.confirm.title")}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{td("dashboard.confirm.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant={danger ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel ?? td("dashboard.confirm.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
