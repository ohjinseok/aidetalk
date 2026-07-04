/**
 * 키셋 페이지네이션 커서 — 04_API_SPEC.md §0 / 서버 apps/server/src/lib/cursor.ts와 동일 형식.
 *
 * cursor = 마지막 항목의 (createdAt, id) 정렬키를 JSON 직렬화 후 base64url 인코딩.
 * 서버가 정본이며(decodeCursor로 { createdAt, id } 복원 후 keyset 질의), 위젯은 마지막 확정
 * 메시지로부터 동일한 커서를 재구성해 GET messages?after= 에 넘긴다.
 */

/** (createdAt ISO, id) → base64url 커서 문자열. */
export function encodeCursor(createdAt: string, id: string): string {
  const json = JSON.stringify({ createdAt, id });
  return toBase64Url(json);
}

/** UTF-8 안전 base64url 인코딩(브라우저). 패딩 제거 — Node Buffer의 base64url과 호환. */
function toBase64Url(input: string): string {
  const b64 = btoa(unescape(encodeURIComponent(input)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
