/**
 * Agent endpoint URL 검증 + SSRF 가드 — 08_SECURITY.md §2.
 * - 클라우드(EDITION=cloud)에서는 https 강제 + resolve된 IP가 사설/루프백/링크로컬이면 거부.
 * - 등록 시(validateAgentEndpoint)와 dispatch 시(assertResolvesToPublicIp) 모두 검사(DNS 리바인딩 대비).
 * - 셀프호스팅은 ALLOW_INSECURE_AGENT_ENDPOINT=true로 완화 가능.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { AppError } from "@aidetalk/shared";

import type { Env } from "../env";

export interface EndpointPolicy {
  /** EDITION=cloud면 true. */
  cloud: boolean;
  /** ALLOW_INSECURE_AGENT_ENDPOINT=true면 true(셀프호스팅 완화). */
  allowInsecure: boolean;
}

/**
 * env → EndpointPolicy. agent/웹훅 endpoint 검증이 공유하는 SSRF 가드 정책(08 §7).
 */
export function endpointPolicy(env: Pick<Env, "EDITION" | "ALLOW_INSECURE_AGENT_ENDPOINT">): EndpointPolicy {
  return {
    cloud: env.EDITION === "cloud",
    allowInsecure: env.ALLOW_INSECURE_AGENT_ENDPOINT,
  };
}

/** 사설/루프백/링크로컬/유니크로컬 IP 대역인지(SSRF 차단 대상). */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIpv4(ip);
  if (v === 6) return isPrivateIpv6(ip);
  return true; // 파싱 불가 → 보수적으로 차단
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique-local
  // IPv4-mapped(::ffff:a.b.c.d)는 내부 v4 검사로 위임.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  return false;
}

/**
 * 등록 시 URL 검증. 형식·스킴·(클라우드) https·SSRF를 확인한다.
 * 실패 시 validation/failed(400) throw. 통과하면 정규화된 URL 문자열 반환.
 */
export async function validateAgentEndpoint(
  rawUrl: string,
  policy: EndpointPolicy,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw AppError.of("validation/failed", "invalid endpointUrl format");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw AppError.of("validation/failed", "endpointUrl must be http or https");
  }
  if (policy.cloud && !policy.allowInsecure && url.protocol !== "https:") {
    throw AppError.of("validation/failed", "cloud allows https endpoint only");
  }
  if (policy.cloud && !policy.allowInsecure) {
    await assertResolvesToPublicIp(url.hostname);
  }
  return url.toString();
}

/**
 * dispatch 직전 SSRF 재검사(DNS 리바인딩 대비). 사설 IP로 리졸브되면 validation/failed throw.
 * 비-클라우드/완화 모드에서는 호출하지 않는다.
 */
export async function assertResolvesToPublicIp(hostname: string): Promise<void> {
  // 호스트명이 이미 IP 리터럴이면 바로 검사.
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw AppError.of("validation/failed", "private/loopback IP endpoint not allowed");
    }
    return;
  }
  let results: { address: string }[];
  try {
    results = await lookup(hostname, { all: true });
  } catch {
    throw AppError.of("validation/failed", "endpoint host resolution failed");
  }
  if (results.length === 0 || results.some((r) => isPrivateIp(r.address))) {
    throw AppError.of("validation/failed", "private/loopback IP endpoint not allowed");
  }
}
