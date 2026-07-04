/**
 * reply text 내 URL 추출 + 전환 추적 토큰(at_l) 부착 — 02_ARCHITECTURE.md §3.4.
 * track_links=true인 reply에 대해 text 내 http(s) URL을 tracked_links로 기록하고
 * 원본 URL을 `원본 + (?|&)at_l={token}`으로 치환해 발송한다.
 */

import { randomBytes } from "node:crypto";

/** 전환 추적 토큰(at_l) 생성 — 짧은 URL-safe 문자열. */
export function generateLinkToken(): string {
  return randomBytes(8).toString("base64url");
}

/** text에서 http(s) URL을 등장 순서대로 추출. 중복 URL도 각각 별도 추적. */
export function extractUrls(text: string): string[] {
  // 공백/따옴표/괄호 등 경계 문자 전까지를 URL로 간주. 뒤따르는 문장부호는 제외.
  const re = /https?:\/\/[^\s<>"')\]}]+/g;
  const found: string[] = [];
  for (const m of text.matchAll(re)) {
    // 끝의 문장부호(. , ! ? : ;)는 URL에서 떼어낸다.
    const url = m[0].replace(/[.,!?:;]+$/, "");
    found.push(url);
  }
  return found;
}

/** 원본 URL에 at_l 토큰 쿼리 파라미터를 붙인다(기존 쿼리 유무에 따라 ?/&). */
export function appendTrackingToken(url: string, token: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}at_l=${token}`;
}

export interface LinkReplacement {
  original: string;
  token: string;
}

/**
 * text의 각 URL을 (원본→토큰) 매핑 순서대로 치환.
 * replacements는 extractUrls와 동일 순서/개수여야 한다(동일 URL 반복도 순서대로 1:1).
 */
export function replaceUrls(text: string, replacements: LinkReplacement[]): string {
  let idx = 0;
  const re = /https?:\/\/[^\s<>"')\]}]+/g;
  return text.replace(re, (match) => {
    const trailing = match.match(/[.,!?:;]+$/)?.[0] ?? "";
    const core = trailing ? match.slice(0, -trailing.length) : match;
    const rep = replacements[idx++];
    if (!rep || rep.original !== core) return match;
    return appendTrackingToken(core, rep.token) + trailing;
  });
}
