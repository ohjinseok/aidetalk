"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "../../components/providers/ToastProvider";
import { Button } from "../../components/ui/Button";
import { FormRow, Input } from "../../components/ui/Field";
import { authApi } from "../../lib/api/endpoints";
import { td } from "../../lib/i18n";

export default function SignupPage() {
  const router = useRouter();
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
      // 신규 가입은 워크스페이스가 없으므로 온보딩으로.
      router.replace("/onboarding");
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-sm"
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
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {td("dashboard.auth.signupSubmit")}
        </Button>
        <p className="mt-4 text-center text-sm text-gray-500">
          <Link href="/login" className="text-brand hover:underline">
            {td("dashboard.auth.toLogin")}
          </Link>
        </p>
      </form>
    </main>
  );
}
