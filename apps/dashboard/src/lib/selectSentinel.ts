/**
 * Radix Select(`@/components/ui/select`)는 빈 문자열 value를 허용하지 않는다.
 * "전체"/"미지정"처럼 값이 없음을 나타내려면 대체 문자열(센티넬)이 필요하다.
 * 이 두 함수는 그 변환 로직을 한 곳에 모아, 화면마다 같은 3항 연산을 복붙하지 않게 한다.
 * 센티넬 문자열 자체와 emptyValue(예: "" 또는 null)는 호출부에서 각자 정의한다.
 */

/** 실제 값 → Select value. emptyValue와 일치하면 센티넬로 치환한다. */
export function toSentinel<T extends string | null>(
  value: T,
  sentinel: string,
  emptyValue: T,
): string {
  return value === emptyValue ? sentinel : (value as string);
}

/** Select value → 실제 값. 센티넬이면 emptyValue로 되돌린다. */
export function fromSentinel<T extends string | null>(
  value: string,
  sentinel: string,
  emptyValue: T,
): T | string {
  return value === sentinel ? emptyValue : value;
}
