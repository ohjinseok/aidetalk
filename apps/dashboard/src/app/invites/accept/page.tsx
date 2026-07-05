"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useToast } from "../../../components/providers/ToastProvider";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { authApi, memberApi } from "../../../lib/api/endpoints";
import { td } from "../../../lib/i18n";

function AcceptInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const token = params.get("token") ?? "";
  const [busy, setBusy] = useState(false);
  // 로그인 상태 확인 전까지 checking. 미로그인이면 가입/로그인으로 유도(토큰 유지).
  const [authState, setAuthState] = useState<"checking" | "authed" | "anon">("checking");

  useEffect(() => {
    let alive = true;
    authApi
      .me()
      .then(() => alive && setAuthState("authed"))
      .catch(() => alive && setAuthState("anon"));
    return () => {
      alive = false;
    };
  }, []);

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

  if (!token) {
    return (
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">{td("dashboard.invite.acceptTitle")}</h1>
        <p className="text-sm text-red-600">{td("dashboard.invite.missingToken")}</p>
      </div>
    );
  }

  const tokenQs = `inviteToken=${encodeURIComponent(token)}`;

  return (
    <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-sm">
      <h1 className="mb-2 text-xl font-semibold">{td("dashboard.invite.acceptTitle")}</h1>
      {authState === "checking" ? (
        <Spinner />
      ) : authState === "authed" ? (
        <>
          <p className="mb-5 text-sm text-gray-500">{td("dashboard.invite.acceptDesc")}</p>
          <Button variant="primary" className="w-full" disabled={busy} onClick={onAccept}>
            {td("dashboard.invite.acceptSubmit")}
          </Button>
        </>
      ) : (
        <>
          <p className="mb-5 text-sm text-gray-500">{td("dashboard.invite.needAuth")}</p>
          <Link href={`/signup?${tokenQs}`} className="mb-2 block">
            <Button variant="primary" className="w-full">
              {td("dashboard.invite.toSignup")}
            </Button>
          </Link>
          <Link href={`/login?${tokenQs}`} className="block">
            <Button variant="secondary" className="w-full">
              {td("dashboard.invite.toLogin")}
            </Button>
          </Link>
        </>
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
