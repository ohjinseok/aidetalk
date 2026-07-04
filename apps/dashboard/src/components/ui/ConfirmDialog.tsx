"use client";

import { td } from "../../lib/i18n";
import { Button } from "./Button";
import { Modal } from "./Modal";

/** 파괴적 액션 확인(07 §6). */
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
    <Modal
      open={open}
      onClose={onCancel}
      title={title ?? td("dashboard.confirm.title")}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {td("dashboard.confirm.cancel")}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel ?? td("dashboard.confirm.confirm")}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-700">{message}</p>
    </Modal>
  );
}
