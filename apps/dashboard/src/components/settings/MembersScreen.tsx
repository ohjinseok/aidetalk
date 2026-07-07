"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { memberApi } from "@/lib/api/endpoints";
import { td } from "@/lib/i18n";
import type { Member, Role } from "@aidetalk/shared";
import { useResource } from "@/hooks/useResource";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { PageHeader, PageShell, SectionCard } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SettingsTabs } from "./SettingsTabs";

/** 이름/이메일에서 이니셜 1자 추출 — 단색 플랫 아바타(그라데이션 금지, 메모리 규칙). */
function initial(m: Member): string {
  const src = m.name || m.email || m.userId || "?";
  return src.trim().charAt(0).toUpperCase();
}

export function MembersScreen() {
  const { workspace, isOwner } = useWorkspace();
  const wsId = workspace.id;
  const toast = useToast();

  const {
    data: members,
    loading,
    reload,
  } = useResource(() => memberApi.list(wsId), [] as Member[], [wsId]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("agent_member");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await memberApi.invite(wsId, { email, role });
      // 셀프호스팅은 이메일 발송 없음 → inviteUrl 복사 방식(07 §5).
      setInviteUrl(res.inviteUrl);
      setEmail("");
      await reload();
    } catch (err) {
      toast.error(err);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근 불가 환경은 무시.
    }
  }

  async function onRemove(m: Member) {
    try {
      await memberApi.remove(wsId, m.id);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setRemoveTarget(null);
    }
  }

  return (
    <PageShell width="wide">
      <SettingsTabs />
      {/* 탭은 wide 셸 기준 고정 — 본문만 읽기 폭으로 제한(좌측 정렬 유지) */}
      <div className="max-w-3xl">
      <PageHeader
        title={td("dashboard.members.title")}
        description={td("dashboard.members.subtitle")}
      />

      <div className="space-y-5">
        {/* 멤버 목록 */}
        <SectionCard
          title={td("dashboard.members.listTitle")}
          description={td("dashboard.members.listDesc")}
          contentClassName={loading || members.length === 0 ? "px-6 py-5" : "p-0"}
        >
          {loading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : members.length === 0 ? (
            <Empty className="border-0 gap-2 p-0 py-2 md:p-0 md:py-2">
              <EmptyHeader>
                <EmptyTitle className="text-base">{td("dashboard.members.empty")}</EmptyTitle>
                <EmptyDescription>{td("dashboard.members.emptyDesc")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y divide-border/60">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-accent/40"
                >
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground"
                  >
                    {initial(m)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.name || m.email || m.userId}
                    </p>
                    {m.email && m.name ? (
                      <p className="truncate text-[13px] text-muted-foreground">{m.email}</p>
                    ) : null}
                  </div>
                  <Badge variant={m.role === "owner" ? "soft" : "outline"}>
                    {td(
                      m.role === "owner"
                        ? "dashboard.members.roleOwner"
                        : "dashboard.members.roleAgent",
                    )}
                  </Badge>
                  <Badge variant={m.status === "active" ? "success" : "warning"}>
                    {td(
                      m.status === "active"
                        ? "dashboard.members.statusActive"
                        : "dashboard.members.statusInvited",
                    )}
                  </Badge>
                  {isOwner ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setRemoveTarget(m)}
                    >
                      {td("dashboard.members.remove")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 초대 */}
        {isOwner ? (
          <SectionCard
            title={td("dashboard.members.invite")}
            description={td("dashboard.members.inviteDesc")}
          >
            <form onSubmit={onInvite} className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <Label htmlFor="inviteEmail" className="mb-1.5">
                  {td("dashboard.members.inviteEmail")}
                </Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="w-36">
                <Label htmlFor="inviteRole" className="mb-1.5">
                  {td("dashboard.members.inviteRole")}
                </Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger id="inviteRole" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent_member">
                      {td("dashboard.members.roleAgent")}
                    </SelectItem>
                    <SelectItem value="owner">{td("dashboard.members.roleOwner")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit">{td("dashboard.members.invite")}</Button>
            </form>

            {inviteUrl ? (
              <div className="mt-4 rounded-lg border border-info/25 bg-info/10 p-3.5">
                <p className="mb-2 text-[13px] font-medium text-info">
                  {td("dashboard.members.inviteCreated")}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border border-info/20 bg-background/60 px-2.5 py-1.5 font-mono text-xs text-foreground">
                    {inviteUrl}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyInvite()}
                    aria-label={td("dashboard.members.inviteUrlCopy")}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    {copied ? td("dashboard.common.copied") : td("dashboard.common.copy")}
                  </Button>
                </div>
              </div>
            ) : null}
          </SectionCard>
        ) : null}
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        danger
        message={td("dashboard.members.removeConfirm")}
        onConfirm={() => removeTarget && void onRemove(removeTarget)}
        onCancel={() => setRemoveTarget(null)}
      />
      </div>
    </PageShell>
  );
}
