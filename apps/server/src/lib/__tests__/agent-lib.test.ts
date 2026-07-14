/**
 * Agent 관련 순수 유틸 단위 테스트 — SSRF 가드, track_links 치환.
 * DB 불필요(순수 함수).
 */
import { describe, expect, it } from "vitest";

import {
  assertEndpointHostAllowed,
  endpointPolicy,
  isMetadataIp,
  isPrivateIp,
  validateAgentEndpoint,
} from "../agent-endpoint";
import { appendTrackingToken, extractUrls, replaceUrls } from "../track-links";

/** 엄격 모드(기본): https + 공인 IP만. */
const strict = { allowInsecure: false };
/** 완화 모드(셀프호스팅 ALLOW_INSECURE_AGENT_ENDPOINT=true): http + 사설 IP 허용. */
const insecure = { allowInsecure: true };

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

describe("SSRF 가드 — isMetadataIp(완화 모드에서도 차단되는 대역)", () => {
  it("링크로컬/클라우드 메타데이터는 차단", () => {
    for (const ip of [
      "169.254.169.254", // AWS/GCP/Azure IMDS
      "169.254.1.1",
      "::ffff:169.254.169.254", // IPv4-mapped IPv6
      "fe80::1",
      "fd00:ec2::254", // AWS IMDS IPv6
    ]) {
      expect(isMetadataIp(ip)).toBe(true);
    }
  });
  it("일반 사설/공인 IP는 메타데이터가 아니다", () => {
    for (const ip of ["192.168.1.10", "10.0.0.5", "172.17.0.3", "8.8.8.8", "fd12::1"]) {
      expect(isMetadataIp(ip)).toBe(false);
    }
  });
});

describe("endpointPolicy — 플래그 의미", () => {
  it("기본(셀프호스팅, 플래그 off)은 엄격", () => {
    expect(endpointPolicy({ EDITION: undefined, ALLOW_INSECURE_AGENT_ENDPOINT: false })).toEqual(
      strict,
    );
  });
  it("셀프호스팅 + 플래그 on이면 완화", () => {
    expect(endpointPolicy({ EDITION: undefined, ALLOW_INSECURE_AGENT_ENDPOINT: true })).toEqual(
      insecure,
    );
  });
  it("클라우드는 플래그를 무시하고 항상 엄격", () => {
    expect(endpointPolicy({ EDITION: "cloud", ALLOW_INSECURE_AGENT_ENDPOINT: true })).toEqual(
      strict,
    );
  });
});

describe("validateAgentEndpoint — 기본(엄격) 정책", () => {
  it("http는 에디션 무관 거부", async () => {
    await expect(validateAgentEndpoint("http://203.0.113.10/x", strict)).rejects.toMatchObject({
      code: "validation/failed",
    });
  });
  it("사설 IP(https)는 거부", async () => {
    for (const url of ["https://127.0.0.1/x", "https://192.168.1.10/x", "https://10.1.2.3/x"]) {
      await expect(validateAgentEndpoint(url, strict)).rejects.toMatchObject({
        code: "validation/failed",
      });
    }
  });
  it("클라우드 메타데이터 주소는 거부", async () => {
    await expect(
      validateAgentEndpoint("https://169.254.169.254/latest/meta-data/", strict),
    ).rejects.toMatchObject({ code: "validation/failed" });
  });
  it("공인 IP + https는 허용", async () => {
    const url = await validateAgentEndpoint("https://203.0.113.10/agent", strict);
    expect(url).toContain("203.0.113.10");
  });
  it("스킴이 아니면 거부", async () => {
    await expect(validateAgentEndpoint("ftp://x/y", strict)).rejects.toMatchObject({
      code: "validation/failed",
    });
  });
});

describe("validateAgentEndpoint — ALLOW_INSECURE_AGENT_ENDPOINT=true(완화)", () => {
  it("내부망/도커 네트워크 에이전트(http + 사설 IP)는 허용", async () => {
    const loopback = await validateAgentEndpoint("http://127.0.0.1:5000/agent", insecure);
    expect(loopback).toContain("127.0.0.1");
    const lan = await validateAgentEndpoint("http://192.168.1.10:3000/agent", insecure);
    expect(lan).toContain("192.168.1.10");
  });
  it("완화 모드에서도 링크로컬/메타데이터 주소는 거부", async () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
      "https://169.254.169.254/computeMetadata/v1/",
      "http://[fd00:ec2::254]/latest/meta-data/",
    ]) {
      await expect(validateAgentEndpoint(url, insecure)).rejects.toMatchObject({
        code: "validation/failed",
      });
    }
  });
});

describe("assertEndpointHostAllowed — dispatch 직전 재검사(웹훅/커넥터 공통)", () => {
  it("엄격 모드: 사설 IP 차단, 공인 IP 통과", async () => {
    await expect(assertEndpointHostAllowed("10.0.0.7", strict)).rejects.toMatchObject({
      code: "validation/failed",
    });
    await expect(assertEndpointHostAllowed("203.0.113.10", strict)).resolves.toBeUndefined();
  });
  it("완화 모드: 사설 IP 통과, 메타데이터 차단", async () => {
    await expect(assertEndpointHostAllowed("10.0.0.7", insecure)).resolves.toBeUndefined();
    await expect(assertEndpointHostAllowed("169.254.169.254", insecure)).rejects.toMatchObject({
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
