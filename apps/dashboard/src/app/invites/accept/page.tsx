"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { useToast } from "../../../components/providers/ToastProvider";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { memberApi } from "../../../lib/api/endpoints";
import { td } from "../../../lib/i18n";

function AcceptInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const token = params.get("token") ?? "";
  const [busy, setBusy] = useState(false);

  async function onAccept() {
    if (!token) return;
    setBusy(true);
    try {
      const res = await memberApi.acceptInvite(token);
      toast.success(td("dashboard.invite.accepted"));
      router.replace(`/w/${res.member.workspaceId}/inbox`);
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-sm">
      <h1 className="mb-2 text-xl font-semibold">{td("dashboard.invite.acceptTitle")}</h1>
      {token ? (
        <>
          <p className="mb-5 text-sm text-gray-500">{td("dashboard.invite.acceptDesc")}</p>
          <Button variant="primary" className="w-full" disabled={busy} onClick={onAccept}>
            {td("dashboard.invite.acceptSubmit")}
          </Button>
        </>
      ) : (
        <p className="text-sm text-red-600">{td("dashboard.invite.missingToken")}</p>
      )}
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={<Spinner />}>
        <AcceptInner />
      </Suspense>
    </main>
  );
}
