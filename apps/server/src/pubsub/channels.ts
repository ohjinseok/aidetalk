/**
 * PubSub 채널 이름 규약 — 04_API_SPEC.md §5.5.
 *   ws:{workspaceId}:inbox    → inbox.upsert, handoff.new (agent 소켓만)
 *   conv:{conversationId}:all  → message.new, typing, conversation.updated (visitor+agent 공용)
 *   conv:{conversationId}:agents → suggestion.new (⚠️ visitor 소켓은 절대 구독하지 않음)
 */
export const channels = {
  wsInbox: (workspaceId: string) => `ws:${workspaceId}:inbox`,
  convAll: (conversationId: string) => `conv:${conversationId}:all`,
  convAgents: (conversationId: string) => `conv:${conversationId}:agents`,
} as const;

/** conv:{id}:agents 채널인지(visitor fan-out 원천 차단 판정용). */
export function isAgentsChannel(channel: string): boolean {
  return channel.startsWith("conv:") && channel.endsWith(":agents");
}
