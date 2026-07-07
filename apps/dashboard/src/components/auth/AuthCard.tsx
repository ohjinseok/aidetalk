"use client";

import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { td, type TranslationKey } from "@/lib/i18n";

import { AuthBrandMark } from "./AuthBrandMark";

interface AuthCardProps {
  titleKey: TranslationKey;
  /** 제목 아래 보조 설명(선택). */
  descriptionKey?: TranslationKey;
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
 * 폼 필드(children)와 제출 로직만 다르다.
 */
export function AuthCard({
  titleKey,
  descriptionKey,
  submitKey,
  footerHref,
  footerKey,
  busy,
  onSubmit,
  children,
}: AuthCardProps) {
  const title = td(titleKey);
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-sm gap-0 py-8 shadow-sm" aria-label={title}>
        <CardHeader className="gap-1.5 text-center">
          <AuthBrandMark />
          <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
          {descriptionKey ? <CardDescription>{td(descriptionKey)}</CardDescription> : null}
        </CardHeader>
        <CardContent className="mt-7">
          <form onSubmit={onSubmit}>
            {children}
            <Button type="submit" className="mt-1 h-10 w-full" disabled={busy}>
              {td(submitKey)}
            </Button>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Link
                href={footerHref}
                className="rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
