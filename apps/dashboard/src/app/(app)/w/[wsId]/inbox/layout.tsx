import { InboxList } from "../../../../../components/inbox/InboxList";

/** 인박스 2/3컬럼 셸 — 좌측 목록 + (중앙/우측) 상세는 children(07 §2). */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <InboxList />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
