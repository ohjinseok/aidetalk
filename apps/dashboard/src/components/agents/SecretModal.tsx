"use client";

import { useState } from "react";
import { AlertTriangle, Eye, EyeOff, KeyRound } from "lucide-react";

import { CopyButton } from "@/components/ui/copy-button";
import { Modal } from "@/components/ui/modal";
import { td, type TranslationKey } from "@/lib/i18n";

const NODE_EXAMPLE = `import crypto from "node:crypto";

// 04 §5 / 05 프로토콜: X-AideTalk-Signature = HMAC-SHA256(rawBody, secret)
function verify(rawBody, signature, secret) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}`;

const PYTHON_EXAMPLE = `import hmac, hashlib

def verify(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)`;

/**
 * 커넥터/웹훅 등록·재발급 후 secret 1회 노출 모달 — 07 §4/§5. 재조회 불가 경고 필수.
 * 시크릿은 기본 마스킹(눈 아이콘으로 토글) — 화면에 평문을 방치하지 않는다(규칙 5).
 * 문구는 titleKey/labelKey/warningKey로 오버라이드 가능(웹훅 화면이 이 컴포넌트를 재사용, 07 §5).
 */
export function SecretModal({
  open,
  secret,
  onClose,
  titleKey = "dashboard.agents.secretModalTitle",
  labelKey = "dashboard.agents.secretLabel",
  warningKey = "dashboard.agents.secretWarning",
}: {
  open: boolean;
  secret: string;
  onClose: () => void;
  titleKey?: TranslationKey;
  labelKey?: TranslationKey;
  warningKey?: TranslationKey;
}) {
  const [tab, setTab] = useState<"node" | "python">("node");
  const [revealed, setRevealed] = useState(false);
  const code = tab === "node" ? NODE_EXAMPLE : PYTHON_EXAMPLE;

  // 닫힐 때 reveal 상태 초기화(다음 노출 때 다시 마스킹부터).
  function handleClose() {
    setRevealed(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={td(titleKey)}>
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-warning">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="text-sm">{td(warningKey)}</p>
      </div>

      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <KeyRound className="size-3.5" aria-hidden />
        {td(labelKey)}
      </label>
      <div className="mb-5 flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
          {revealed ? secret : "•".repeat(Math.min(secret.length, 40))}
        </code>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? td("dashboard.agents.secretHide") : td("dashboard.agents.secretReveal")}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
        <CopyButton value={secret} />
      </div>

      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {td("dashboard.agents.secretExampleTitle")}
      </p>
      <div className="mb-2 inline-flex gap-1 rounded-lg bg-muted p-0.5">
        {(["node", "python"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "node"
              ? td("dashboard.agents.exampleNode")
              : td("dashboard.agents.examplePython")}
          </button>
        ))}
      </div>
      <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted p-3 font-mono text-xs text-foreground">
        <code>{code}</code>
      </pre>
    </Modal>
  );
}
