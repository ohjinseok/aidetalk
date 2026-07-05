"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { AuthCard, AuthSuspense } from "@/components/auth/AuthCard";
import { useToast } from "@/components/providers/ToastProvider";
import { FormRow } from "@/components/ui/form-row";
import { Input } from "@/components/ui/input";
import { authApi, memberApi } from "@/lib/api/endpoints";
import { td } from "@/lib/i18n";

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
    <AuthCard
      titleKey="dashboard.auth.signupTitle"
      submitKey="dashboard.auth.signupSubmit"
      footerHref={loginHref}
      footerKey="dashboard.auth.toLogin"
      busy={busy}
      onSubmit={onSubmit}
    >
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
    </AuthCard>
  );
}

export default function SignupPage() {
  return (
    <AuthSuspense>
      <SignupInner />
    </AuthSuspense>
  );
}
