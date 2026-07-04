import type { Metadata } from "next";

import { ToastProvider } from "../components/providers/ToastProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AideTalk",
  description: "한국 SMB를 위한 오픈소스 CS 메신저",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
