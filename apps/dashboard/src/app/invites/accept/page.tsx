"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AuthBrandMark } from "@/components/auth/AuthBrandMark";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authApi, memberApi } from "@/lib/api/endpoints";
import { td } from "@/lib/i18n";

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
      <Card
        className="w-full max-w-sm gap-0 py-8 text-center shadow-sm"
        aria-label={td("dashboard.invite.acceptTitle")}
      >
        <CardHeader className="gap-1.5">
          <AuthBrandMark />
          <CardTitle className="text-xl font-semibold tracking-tight">
            {td("dashboard.invite.acceptTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="mt-7">
          <p className="text-sm text-destructive">{td("dashboard.invite.missingToken")}</p>
        </CardContent>
      </Card>
    );
  }

  const tokenQs = `inviteToken=${encodeURIComponent(token)}`;

  return (
    <Card
      className="w-full max-w-sm gap-0 py-8 text-center shadow-sm"
      aria-label={td("dashboard.invite.acceptTitle")}
    >
      <CardHeader className="gap-1.5">
        <AuthBrandMark />
        <CardTitle className="text-xl font-semibold tracking-tight">
          {td("dashboard.invite.acceptTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="mt-7">
        {authState === "checking" ? (
          <Spinner />
        ) : authState === "authed" ? (
          <>
            <p className="mb-5 text-sm text-muted-foreground">
              {td("dashboard.invite.acceptDesc")}
            </p>
            <Button className="w-full" disabled={busy} onClick={onAccept}>
              {td("dashboard.invite.acceptSubmit")}
            </Button>
          </>
        ) : (
          <>
            <p className="mb-5 text-sm text-muted-foreground">{td("dashboard.invite.needAuth")}</p>
            <Link href={`/signup?${tokenQs}`} className="mb-2 block">
              <Button className="w-full">{td("dashboard.invite.toSignup")}</Button>
            </Link>
            <Link href={`/login?${tokenQs}`} className="block">
              <Button variant="outline" className="w-full">
                {td("dashboard.invite.toLogin")}
              </Button>
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function InviteAcceptPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Suspense fallback={<Spinner />}>
        <AcceptInner />
      </Suspense>
    </main>
  );
}
