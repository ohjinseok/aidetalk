"use client";

import { useParams } from "next/navigation";

import { ConversationView } from "@/components/inbox/ConversationView";

/** 대화 상세 — 07 §2.2/2.3. */
export default function ConversationPage() {
  const params = useParams<{ convId: string }>();
  return <ConversationView key={params.convId} convId={params.convId} />;
}
