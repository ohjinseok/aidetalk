import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { td } from "@/lib/i18n";

/** 대화 미선택 상태 — 07 §2. */
export default function InboxIndexPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{td("dashboard.inbox.selectConversation")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
