/**
 * 클라이언트 메시지 ID 생성 — 06_WIDGET_SPEC.md §4.1 (`clientMsgId = newId("cm")`).
 *
 * shared의 newId는 03 문서 엔티티 prefix만 허용하고 nanoid 의존을 끌어오므로,
 * 위젯 번들 절감을 위해 crypto 기반 로컬 생성기를 쓴다. 형식은 `cm_{22자}`.
 */
export function newClientMsgId(): string {
  return `cm_${randomToken()}`;
}

function randomToken(): string {
  const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID().replace(/-/g, "");
  }
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    let out = "";
    for (const b of bytes) out += b.toString(16).padStart(2, "0");
    return out;
  }
  // 최후 폴백 — 충돌 위험은 있으나 서버가 clientMsgId로 중복 제거하므로 안전 범위.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
