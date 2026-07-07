"use client";

import type { Conversation, Member } from "@aidetalk/shared";

import { td } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DetailsSection } from "../DetailsSidebar";

// Radix Select는 빈 문자열 value를 허용하지 않아 "담당자 미지정"에 센티넬 값을 쓴다.
const UNASSIGNED = "__unassigned__";

/** 담당자 지정 섹션 — 헤더에서 이식. members·onAssign은 ConversationView가 소유. */
export function AssignSection({
  conversation,
  members,
  onAssign,
}: {
  conversation: Conversation;
  members: Member[];
  onAssign: (userId: string | null) => void;
}) {
  return (
    <DetailsSection name="assign" title={td("dashboard.conversation.assignSection")}>
      <Select
        value={conversation.assigneeId ?? UNASSIGNED}
        onValueChange={(v) => onAssign(v === UNASSIGNED ? null : v)}
      >
        <SelectTrigger className="h-9 w-full text-[13px]" aria-label={td("dashboard.conversation.assign")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>{td("dashboard.conversation.assignPlaceholder")}</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.userId}>
              {m.name || m.email || m.userId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </DetailsSection>
  );
}
