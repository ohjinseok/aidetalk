"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Spinner } from "../components/ui/Spinner";
import { authApi } from "../lib/api/endpoints";
import { ApiError } from "../lib/api/client";

/**
 * 루트 진입 — 세션 확인 후 라우팅.
 * 멤버십 있으면 첫 워크스페이스 인박스, 없으면 온보딩, 미인증이면 로그인.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    authApi
      .me()
      .then((me) => {
        if (!alive) return;
        const first = me.memberships[0];
        router.replace(first ? `/w/${first.workspaceId}/inbox` : "/onboarding");
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.httpStatus === 401) router.replace("/login");
        else router.replace("/login");
      });
    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <Spinner />
    </main>
  );
}
