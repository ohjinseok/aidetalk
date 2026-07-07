"use client";

import { useMemo } from "react";

import type { Message } from "@aidetalk/shared";

import { td } from "@/lib/i18n";
import { DetailsSection } from "../DetailsSidebar";

const URL_RE = /https?:\/\/[^\s<>"')]+/g;

/** 도메인+경로만 짧게 — 스킴·쿼리·해시 제거, 너무 길면 잘라 표시. */
function shortLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.host}${path}`;
  } catch {
    return url;
  }
}

/**
 * 웹 링크 모아보기 — 현재 대화 메시지에서 URL을 추출(중복 제거, 최신순).
 * ⚠️ 클라이언트 전용: 서버 호출 없이 messages에서만 파싱한다.
 */
export function LinksSection({ messages }: { messages: Message[] }) {
  const links = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    // 최신순 — 뒤에서부터 순회.
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg) continue;
      const matched = msg.content.text.match(URL_RE);
      if (!matched) continue;
      for (const url of matched) {
        if (seen.has(url)) continue;
        seen.add(url);
        out.push(url);
      }
    }
    return out;
  }, [messages]);

  return (
    <DetailsSection
      name="links"
      title={td("dashboard.conversation.linksSection")}
      defaultOpen={false}
    >
      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground">{td("dashboard.conversation.linksEmpty")}</p>
      ) : (
        <ul className="space-y-1">
          {links.map((url) => (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="block truncate text-[13px] text-primary hover:underline"
                title={url}
              >
                {shortLabel(url)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </DetailsSection>
  );
}
