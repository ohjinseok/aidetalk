"use client";

import { useEffect, useState } from "react";

import { memberApi } from "../../lib/api/endpoints";
import { td } from "../../lib/i18n";
import type { Member, Role } from "../../lib/api/schemas";
import { useToast } from "../providers/ToastProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CopyButton } from "../ui/CopyButton";
import { EmptyState } from "../ui/EmptyState";
import { FormRow, Input, Select } from "../ui/Field";
import { Spinner } from "../ui/Spinner";

export function MembersScreen() {
  const { workspace, isOwner } = useWorkspace();
  const wsId = workspace.id;
  const toast = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("agent_member");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  async function reload() {
    try {
      setMembers(await memberApi.list(wsId));
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [wsId]);

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
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-lg font-semibold">{td("dashboard.members.title")}</h1>

      {isOwner ? (
        <form onSubmit={onInvite} className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">{td("dashboard.members.invite")}</h2>
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
                <Select
                  id="inviteRole"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="agent_member">{td("dashboard.members.roleAgent")}</option>
                  <option value="owner">{td("dashboard.members.roleOwner")}</option>
                </Select>
              </FormRow>
            </div>
            <div className="mb-4">
              <Button type="submit" variant="primary">
                {td("dashboard.members.invite")}
              </Button>
            </div>
          </div>

          {inviteUrl ? (
            <div className="mt-2 rounded bg-indigo-50 p-3">
              <p className="mb-1 text-xs text-indigo-700">{td("dashboard.members.inviteCreated")}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-white px-2 py-1 text-xs">
                  {inviteUrl}
                </code>
                <CopyButton value={inviteUrl} label={td("dashboard.members.inviteUrlCopy")} />
              </div>
            </div>
          ) : null}
        </form>
      ) : null}

      {/* 목록 */}
      {loading ? (
        <Spinner />
      ) : members.length === 0 ? (
        <EmptyState title={td("dashboard.members.empty")} />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-800">{m.name || m.email || m.userId}</p>
                {m.email ? <p className="truncate text-xs text-gray-400">{m.email}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.role === "owner" ? "indigo" : "gray"}>
                  {td(m.role === "owner" ? "dashboard.members.roleOwner" : "dashboard.members.roleAgent")}
                </Badge>
                <Badge tone={m.status === "active" ? "green" : "yellow"}>
                  {td(m.status === "active" ? "dashboard.members.statusActive" : "dashboard.members.statusInvited")}
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
