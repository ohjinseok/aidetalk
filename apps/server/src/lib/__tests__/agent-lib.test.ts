/**
 * Agent 관련 순수 유틸 단위 테스트 — SSRF 가드, track_links 치환.
 * DB 불필요(순수 함수).
 */
import { describe, expect, it } from "vitest";

import { isPrivateIp, validateAgentEndpoint } from "../agent-endpoint";
import { appendTrackingToken, extractUrls, replaceUrls } from "../track-links";

describe("SSRF 가드 — isPrivateIp", () => {
  it("사설/루프백/링크로컬은 차단", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.1.1", "::1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });
  it("공인 IP는 허용", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.10"]) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });
});

describe("validateAgentEndpoint — 클라우드 정책", () => {
  const cloud = { cloud: true, allowInsecure: false };
  const selfhost = { cloud: false, allowInsecure: false };

  it("클라우드는 http 거부", async () => {
    await expect(validateAgentEndpoint("http://api.example.com/x", cloud)).rejects.toMatchObject({
      code: "validation/failed",
    });
  });
  it("클라우드는 사설 IP(https) 거부", async () => {
    await expect(validateAgentEndpoint("https://127.0.0.1/x", cloud)).rejects.toMatchObject({
      code: "validation/failed",
    });
  });
  it("셀프호스팅은 http/loopback 허용", async () => {
    const url = await validateAgentEndpoint("http://127.0.0.1:5000/agent", selfhost);
    expect(url).toContain("127.0.0.1");
  });
  it("스킴이 아니면 거부", async () => {
    await expect(validateAgentEndpoint("ftp://x/y", selfhost)).rejects.toMatchObject({
      code: "validation/failed",
    });
  });
});

describe("track_links — URL 추출/치환", () => {
  it("URL 2개 추출 + at_l 치환", () => {
    const text = "여기 https://a.com/x 그리고 https://b.com/y?p=1 보세요.";
    const urls = extractUrls(text);
    expect(urls).toEqual(["https://a.com/x", "https://b.com/y?p=1"]);

    const replaced = replaceUrls(text, [
      { original: "https://a.com/x", token: "T1" },
      { original: "https://b.com/y?p=1", token: "T2" },
    ]);
    expect(replaced).toContain("https://a.com/x?at_l=T1");
    expect(replaced).toContain("https://b.com/y?p=1&at_l=T2"); // 기존 쿼리 있으면 &
  });
  it("기존 쿼리 유무에 따라 ?/& 선택", () => {
    expect(appendTrackingToken("https://a.com/x", "T")).toBe("https://a.com/x?at_l=T");
    expect(appendTrackingToken("https://a.com/x?a=1", "T")).toBe("https://a.com/x?a=1&at_l=T");
  });
});
