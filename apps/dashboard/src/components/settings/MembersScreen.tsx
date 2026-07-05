"use client";

import { useState } from "react";

import { memberApi } from "@/lib/api/endpoints";
import { td } from "@/lib/i18n";
import type { Member, Role } from "@/lib/api/schemas";
import { useResource } from "@/hooks/useResource";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CopyButton } from "@/components/ui/CopyButton";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { FormRow } from "@/components/ui/form-row";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

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
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        {td("dashboard.members.title")}
      </h1>

      {isOwner ? (
        <form onSubmit={onInvite}>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {td("dashboard.members.invite")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1">
                  <FormRow label={td("dashboard.members.inviteEmail")} htmlFor="inviteEmail">
                    <Input
                      id="inviteEmail"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </FormRow>
                </div>
                <div className="w-32">
                  <FormRow label={td("dashboard.members.inviteRole")} htmlFor="inviteRole">
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
                  </FormRow>
                </div>
                <div className="mb-4">
                  <Button type="submit">{td("dashboard.members.invite")}</Button>
                </div>
              </div>

              {inviteUrl ? (
                <div className="rounded-md bg-primary/5 p-3">
                  <p className="mb-1.5 text-xs text-primary">
                    {td("dashboard.members.inviteCreated")}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                      {inviteUrl}
                    </code>
                    <CopyButton value={inviteUrl} label={td("dashboard.members.inviteUrlCopy")} />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </form>
      ) : null}

      {/* 목록 */}
      {loading ? (
        <Spinner />
      ) : members.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{td("dashboard.members.empty")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border rounded-xl border bg-card shadow-sm">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{m.name || m.email || m.userId}</p>
                {m.email ? (
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>
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
                  <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(m)}>
                    {td("dashboard.members.remove")}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        danger
        message={td("dashboard.members.removeConfirm")}
        onConfirm={() => removeTarget && void onRemove(removeTarget)}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
