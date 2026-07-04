import { EmptyState } from "../../../../../components/ui/EmptyState";
import { td } from "../../../../../lib/i18n";

/** 대화 미선택 상태 — 07 §2. */
export default function InboxIndexPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState title={td("dashboard.inbox.selectConversation")} />
    </div>
  );
}
