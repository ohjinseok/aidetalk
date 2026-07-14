/**
 * Agent/웹훅 endpoint URL 검증 + SSRF 가드 — 08_SECURITY.md §2·§7.
 *
 * 정책(에디션 무관, 기본 on):
 * - 기본(ALLOW_INSECURE_AGENT_ENDPOINT=false): https 강제 + resolve된 IP가 공인 IP여야 한다.
 *   사설/루프백/링크로컬/유니크로컬로 리졸브되면 거부(SSRF 차단).
 * - 완화(ALLOW_INSECURE_AGENT_ENDPOINT=true, 셀프호스팅 전용): http 허용 + 사설/내부 IP 허용.
 *   같은 도커 네트워크·LAN의 자기 에이전트(`http://my-agent:8080`)에 붙이기 위한 옵션이다.
 *   단 **링크로컬/클라우드 메타데이터 대역(169.254.0.0/16, fe80::/10, fd00:ec2::254)은 이 경우에도 차단**한다
 *   — 자기 에이전트를 메타데이터 주소에 두는 정당한 사례가 없고, 유출 피해(인스턴스 자격증명)만 크다.
 * - EDITION=cloud에서는 완화 플래그를 무시한다(멀티테넌트 — 워크스페이스 멤버를 신뢰할 수 없다).
 *
 * 검사 시점: 등록 시(validateAgentEndpoint)와 dispatch 직전(assertEndpointHostAllowed) 모두 — DNS 리바인딩 대비.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { AppError } from "@aidetalk/shared";

import type { Env } from "../env";

export interface EndpointPolicy {
  /**
   * true면 http + 사설/내부 IP endpoint를 허용한다(내부망 에이전트 연결용).
   * ALLOW_INSECURE_AGENT_ENDPOINT=true이면서 EDITION!=cloud일 때만 true.
   */
  allowInsecure: boolean;
}

/**
 * env → EndpointPolicy. agent/웹훅 endpoint 검증이 공유하는 SSRF 가드 정책(08 §2·§7).
 * 클라우드에서는 완화 플래그를 무시하고 항상 엄격 모드로 판정한다.
 */
export function endpointPolicy(
  env: Pick<Env, "EDITION" | "ALLOW_INSECURE_AGENT_ENDPOINT">,
): EndpointPolicy {
  return {
    allowInsecure: env.EDITION !== "cloud" && env.ALLOW_INSECURE_AGENT_ENDPOINT,
  };
}

/** 사설/루프백/링크로컬/유니크로컬 IP 대역인지(엄격 모드 차단 대상). */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIpv4(ip);
  if (v === 6) return isPrivateIpv6(ip);
  return true; // 파싱 불가 → 보수적으로 차단
}

/**
 * 링크로컬/클라우드 메타데이터 대역인지(완화 모드에서도 차단 대상).
 * - 169.254.0.0/16: AWS/GCP/Azure IMDS(169.254.169.254) 포함 IPv4 링크로컬 전체.
 * - fe80::/10: IPv6 링크로컬.
 * - fd00:ec2::254: AWS IMDS IPv6 주소(유니크로컬 대역이라 완화 모드에서 통과할 수 있어 별도 차단).
 */
export function isMetadataIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isLinkLocalIpv4(ip);
  if (v === 6) return isLinkLocalIpv6(ip);
  return true; // 파싱 불가 → 보수적으로 차단
}

function isLinkLocalIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  return a === 169 && b === 254; // 169.254.0.0/16 (IMDS 포함)
}

function isLinkLocalIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // fe80::/10 — fe80~febf.
  if (/^fe[89ab]/.test(lower)) return true;
  // AWS IMDS IPv6.
  if (expandsToAwsImdsV6(lower)) return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isLinkLocalIpv4(mapped[1]!);
  return false;
}

/** fd00:ec2::254(축약형/전개형 모두)인지. */
function expandsToAwsImdsV6(lower: string): boolean {
  const groups = lower.split(":");
  // 간단 정규화: "fd00:ec2::254" 형태만 비교하면 되므로 0 패딩을 제거한 뒤 비교한다.
  const compact = groups.map((g) => (g === "" ? "" : g.replace(/^0+(?=.)/, ""))).join(":");
  return compact === "fd00:ec2::254";
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
 * 등록 시 URL 검증. 형식·스킴·https 강제·SSRF를 확인한다.
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
  if (!policy.allowInsecure && url.protocol !== "https:") {
    throw AppError.of("validation/failed", "https endpoint required");
  }
  await assertEndpointHostAllowed(url.hostname, policy);
  return url.toString();
}

/**
 * 정책에 따른 호스트 판정. 등록 시와 dispatch 직전(DNS 리바인딩 대비) 모두 호출한다.
 * - 엄격 모드: 공인 IP로만 리졸브돼야 한다.
 * - 완화 모드: 사설/내부 IP는 허용하되 링크로컬/메타데이터 대역은 차단.
 */
export async function assertEndpointHostAllowed(
  hostname: string,
  policy: EndpointPolicy,
): Promise<void> {
  if (policy.allowInsecure) {
    await assertNotMetadataIp(hostname);
    return;
  }
  await assertResolvesToPublicIp(hostname);
}

/** 호스트명(또는 IP 리터럴)을 IP 목록으로 해석한다. 실패 시 validation/failed throw. */
async function resolveAddresses(hostname: string): Promise<string[]> {
  // URL.hostname은 IPv6를 대괄호로 감싸서 준다 — 벗겨서 IP 리터럴로 판정한다.
  const host = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (isIP(host)) return [host];
  try {
    const results = await lookup(host, { all: true });
    return results.map((r) => r.address);
  } catch {
    throw AppError.of("validation/failed", "endpoint host resolution failed");
  }
}

/** 엄격 모드 검사 — 사설/루프백/링크로컬로 리졸브되면 validation/failed throw. */
export async function assertResolvesToPublicIp(hostname: string): Promise<void> {
  const addresses = await resolveAddresses(hostname);
  if (addresses.length === 0 || addresses.some(isPrivateIp)) {
    throw AppError.of("validation/failed", "private/loopback IP endpoint not allowed");
  }
}

/** 완화 모드 검사 — 링크로컬/클라우드 메타데이터 대역으로 리졸브되면 validation/failed throw. */
export async function assertNotMetadataIp(hostname: string): Promise<void> {
  const addresses = await resolveAddresses(hostname);
  if (addresses.length === 0 || addresses.some(isMetadataIp)) {
    throw AppError.of("validation/failed", "link-local/metadata IP endpoint not allowed");
  }
}
