"use client";

import { useState } from "react";

import { CopyButton } from "../ui/CopyButton";
import { Modal } from "../ui/Modal";
import { td, type TranslationKey } from "../../lib/i18n";

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
  const code = tab === "node" ? NODE_EXAMPLE : PYTHON_EXAMPLE;

  return (
    <Modal open={open} onClose={onClose} title={td(titleKey)}>
      <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{td(warningKey)}</p>
      <label className="mb-1 block text-xs font-medium text-gray-500">{td(labelKey)}</label>
      <div className="mb-4 flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-gray-100 px-3 py-2 font-mono text-sm">
          {secret}
        </code>
        <CopyButton value={secret} />
      </div>

      <p className="mb-2 text-xs font-medium text-gray-500">
        {td("dashboard.agents.secretExampleTitle")}
      </p>
      <div className="mb-2 flex gap-1">
        {(["node", "python"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-2 py-1 text-xs ${
              tab === t ? "bg-brand text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {t === "node" ? td("dashboard.agents.exampleNode") : td("dashboard.agents.examplePython")}
          </button>
        ))}
      </div>
      <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
        <code>{code}</code>
      </pre>
    </Modal>
  );
}
