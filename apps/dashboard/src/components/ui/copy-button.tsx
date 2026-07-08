"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { td } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/** 클립보드 복사 버튼 — 복사 후 "복사됨"을 잠깐 표시. 아이콘: Copy → Check. */
export function CopyButton({
  value,
  label,
  size = "sm",
}: {
  value: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size={size === "md" ? "default" : "sm"}
      aria-label={label ?? td("dashboard.common.copy")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // 클립보드 접근 불가 환경은 무시(사용자가 수동 복사).
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? td("dashboard.common.copied") : (label ?? td("dashboard.common.copy"))}
    </Button>
  );
}
