import { InboxFilterProvider } from "@/components/inbox/InboxFilterProvider";
import { InboxList } from "@/components/inbox/InboxList";
import { InboxSidebar } from "@/components/inbox/InboxSidebar";

/** 인박스 3컬럼 셸 — 확장 사이드바 + 좌측 목록 + (중앙/우측) 상세는 children(07 §2). */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <InboxFilterProvider>
      <div className="flex h-full min-w-0">
        <InboxSidebar />
        <InboxList />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </InboxFilterProvider>
  );
}
