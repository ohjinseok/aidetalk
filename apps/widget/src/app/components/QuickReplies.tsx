import { t } from "@aidetalk/i18n/widget";

interface Props {
  replies: string[];
  onPick: (text: string) => void;
}

/** 마지막 상대 메시지의 quickReplies 버튼 — 누르면 그 텍스트로 전송(06 §2). */
export function QuickReplies({ replies, onPick }: Props) {
  if (replies.length === 0) return null;
  return (
    <div class="od-quick" role="group" aria-label={t("widget.quickRepliesLabel")}>
      {replies.map((r) => (
        <button type="button" key={r} onClick={() => onPick(r)}>
          {r}
        </button>
      ))}
    </div>
  );
}
