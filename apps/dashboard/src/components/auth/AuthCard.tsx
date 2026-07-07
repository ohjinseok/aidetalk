"use client";

import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { td, type TranslationKey } from "@/lib/i18n";

import { AuthBrandMark } from "./AuthBrandMark";

interface AuthCardProps {
  titleKey: TranslationKey;
  submitKey: TranslationKey;
  /** 하단 전환 링크(로그인 ↔ 가입) — inviteToken 보존을 위해 href를 그대로 받는다. */
  footerHref: string;
  footerKey: TranslationKey;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
  children: ReactNode;
}

/**
 * 로그인/가입 공용 카드 셸 — 카드·제목·submit 버튼·하단 링크는 동일하고
 * 폼 필드(children)와 제출 로직만 다르다. UX/마크업 불변(추출만).
 */
export function AuthCard({
  titleKey,
  submitKey,
  footerHref,
  footerKey,
  busy,
  onSubmit,
  children,
}: AuthCardProps) {
  const title = td(titleKey);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm" aria-label={title}>
        <CardHeader className="text-center">
          <AuthBrandMark />
          <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            {children}
            <Button type="submit" className="w-full" disabled={busy}>
              {td(submitKey)}
            </Button>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Link
                href={footerHref}
                className="rounded-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {td(footerKey)}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

/** useSearchParams를 쓰는 폼을 감싸는 Suspense 경계(Next App Router 요구). */
export function AuthSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>;
}
