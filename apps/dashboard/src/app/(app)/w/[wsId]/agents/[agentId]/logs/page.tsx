"use client";

import { useParams } from "next/navigation";

import { LogsScreen } from "../../../../../../../components/agents/LogsScreen";

export default function AgentLogsPage() {
  const params = useParams<{ agentId: string }>();
  return <LogsScreen agentId={params.agentId} />;
}
