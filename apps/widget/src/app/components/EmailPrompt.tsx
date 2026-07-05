import { t } from "@aidetalk/i18n/widget";
import { useState } from "preact/hooks";

interface Props {
  onSubmit: (email: string) => void;
  onSkip: () => void;
}

/** 첫 메시지 전송 후 1회 노출되는 이메일 수집(06 §2). 건너뛰기 가능. */
export function EmailPrompt({ onSubmit, onSkip }: Props) {
  const [email, setEmail] = useState("");

  const submit = (e: Event) => {
    e.preventDefault();
    onSubmit(email);
  };

  return (
    <form class="od-emailprompt" onSubmit={submit}>
      <div class="od-eptitle">{t("widget.emailPromptTitle")}</div>
      <div class="od-eprow">
        <input
          type="email"
          value={email}
          placeholder={t("widget.emailPromptPlaceholder")}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="od-ep-save">
          {t("widget.emailPromptSubmit")}
        </button>
      </div>
      <button type="button" class="od-ep-skip" onClick={onSkip}>
        {t("widget.emailPromptSkip")}
      </button>
    </form>
  );
}
