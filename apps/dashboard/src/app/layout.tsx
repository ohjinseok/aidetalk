import type { Metadata } from "next";

import { ThemeProvider } from "../components/providers/ThemeProvider";
import { ToastProvider } from "../components/providers/ToastProvider";
import { Toaster } from "../components/ui/sonner";
// Pretendard Variable — unicode-range 동적 서브셋(한글 전체 woff2 2MB 미다운로드).
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "AideTalk",
  description: "한국 SMB를 위한 오픈소스 CS 메신저",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
          {/* sonner 토스트 렌더 지점 — richColors로 성공(초록)/에러(빨강) 구분. */}
          <Toaster position="bottom-right" duration={4000} richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
