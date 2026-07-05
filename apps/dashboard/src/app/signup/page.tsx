"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { useToast } from "../../components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { FormRow, Input } from "../../components/ui/Field";
import { Spinner } from "../../components/ui/Spinner";
import { authApi, memberApi } from "../../lib/api/endpoints";
import { td } from "../../lib/i18n";

function SignupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const inviteToken = params.get("inviteToken");
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.signup({ name, email, password });
      // 초대 링크로 온 가입이면 가입 직후 자동 수락 → 해당 워크스페이스로 이동.
      if (inviteToken) {
        try {
          const res = await memberApi.acceptInvite(inviteToken);
          router.replace(`/w/${res.member.workspaceId}/inbox`);
          return;
        } catch (err) {
          // 초대 수락 실패(만료 등)여도 가입은 완료 — 안내 후 온보딩으로.
          toast.error(err);
        }
      }
      // 신규 가입은 워크스페이스가 없으므로 온보딩으로.
      router.replace("/onboarding");
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const loginHref = inviteToken
    ? `/login?inviteToken=${encodeURIComponent(inviteToken)}`
    : "/login";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xs"
        aria-label={td("dashboard.auth.signupTitle")}
      >
        <h1 className="mb-5 text-xl font-semibold">{td("dashboard.auth.signupTitle")}</h1>
        <FormRow label={td("dashboard.auth.name")} htmlFor="name">
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </FormRow>
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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormRow>
        <Button type="submit" className="w-full" disabled={busy}>
          {td("dashboard.auth.signupSubmit")}
        </Button>
        <p className="mt-4 text-center text-sm text-gray-500">
          <Link href={loginHref} className="text-brand hover:underline">
            {td("dashboard.auth.toLogin")}
          </Link>
        </p>
      </form>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SignupInner />
    </Suspense>
  );
}
