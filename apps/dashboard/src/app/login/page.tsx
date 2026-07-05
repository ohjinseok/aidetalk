"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { useToast } from "../../components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { FormRow } from "@/components/ui/form-row";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authApi, memberApi } from "../../lib/api/endpoints";
import { td } from "../../lib/i18n";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const inviteToken = params.get("inviteToken");
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.login({ email, password });
      // 초대 링크로 온 로그인이면 로그인 직후 자동 수락 → 해당 워크스페이스로 이동.
      if (inviteToken) {
        try {
          const res = await memberApi.acceptInvite(inviteToken);
          router.replace(`/w/${res.member.workspaceId}/inbox`);
          return;
        } catch (err) {
          toast.error(err);
        }
      }
      const me = await authApi.me();
      const first = me.memberships[0];
      router.replace(first ? `/w/${first.workspaceId}/inbox` : "/onboarding");
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const signupHref = inviteToken
    ? `/signup?inviteToken=${encodeURIComponent(inviteToken)}`
    : "/signup";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xs"
        aria-label={td("dashboard.auth.loginTitle")}
      >
        <h1 className="mb-5 text-xl font-semibold">{td("dashboard.auth.loginTitle")}</h1>
        <FormRow label={td("dashboard.auth.email")} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormRow>
        <FormRow label={td("dashboard.auth.password")} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormRow>
        <Button type="submit" className="w-full" disabled={busy}>
          {td("dashboard.auth.loginSubmit")}
        </Button>
        <p className="mt-4 text-center text-sm text-gray-500">
          <Link href={signupHref} className="text-brand hover:underline">
            {td("dashboard.auth.toSignup")}
          </Link>
        </p>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LoginInner />
    </Suspense>
  );
}
