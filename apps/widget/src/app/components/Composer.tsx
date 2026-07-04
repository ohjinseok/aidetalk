import { t } from "@aidetalk/i18n";
import { useRef, useState } from "preact/hooks";

import { SendIcon } from "./icons";

interface Props {
  onSend: (text: string) => void;
}

/** 자동 높이 textarea + Enter 전송(Shift+Enter 줄바꿈) — 06 §2. */
export function Composer({ onSend }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const autosize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
    const el = ref.current;
    if (el) el.style.height = "auto";
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div class="od-composer">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        placeholder={t("widget.composerPlaceholder")}
        onInput={(e) => {
          setText((e.target as HTMLTextAreaElement).value);
          autosize();
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        class="od-send"
        aria-label={t("widget.composerSend")}
        disabled={text.trim().length === 0}
        onClick={submit}
      >
        <SendIcon />
      </button>
    </div>
  );
}
