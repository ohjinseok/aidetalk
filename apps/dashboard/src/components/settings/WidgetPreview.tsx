"use client";

import { MessageCircle } from "lucide-react";

import type { WidgetSettings } from "../../lib/api/schemas";
import { td } from "../../lib/i18n";

/**
 * 위젯 라이브 프리뷰 — 07 §5.
 * 실제 위젯 iframe 대신 설정값을 반영한 경량 목업(서버 미기동 환경에서도 동작, 번들 영향 없음).
 * TODO(question): 통합 시 실제 위젯 데모 페이지를 iframe으로 로드할지 결정(07은 iframe 또는 컴포넌트 허용).
 */
export function WidgetPreview({ settings }: { settings: WidgetSettings }) {
  const color = settings.primaryColor || "#4F46E5";
  const greeting = settings.greeting || td("common.welcome");
  const right = (settings.launcherPosition ?? "right") === "right";

  return (
    <div className="relative h-80 overflow-hidden rounded-xl border bg-muted">
      <div className={`absolute bottom-4 flex w-72 flex-col ${right ? "right-4" : "left-4"}`}>
        {/* 아래 흰 배경/회색 말풍선은 위젯(라이트 테마 Shadow DOM) 실물 모사 색 — 토큰화 예외. */}
        <div className="overflow-hidden rounded-xl bg-white shadow-lg">
          <div className="px-4 py-3 text-sm font-semibold text-white" style={{ background: color }}>
            {td("widget.headerTitle")}
          </div>
          <div className="space-y-2 p-3">
            <div className="max-w-[80%] rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700">
              {greeting}
            </div>
            <div className="ml-auto max-w-[80%] rounded-lg px-3 py-2 text-xs text-white" style={{ background: color }}>
              {td("widget.composerPlaceholder")}
            </div>
          </div>
        </div>
        <div className={`mt-2 flex ${right ? "justify-end" : "justify-start"}`}>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg"
            style={{ background: color }}
            aria-hidden
          >
            <MessageCircle className="size-5" strokeWidth={2} />
          </div>
        </div>
      </div>
    </div>
  );
}
