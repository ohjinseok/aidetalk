/**
 * keys.generated.ts ↔ ko.json 동기화 강제.
 * 실패하면: pnpm --filter @aidetalk/i18n gen:keys 실행 후 함께 커밋.
 */
import { describe, expect, it } from "vitest";

import { translationKeys } from "../keys.generated";
import ko from "../locales/ko.json";

function leaves(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("keys.generated.ts 동기화", () => {
  it("ko.json의 leaf 키와 정확히 일치한다 (불일치 시 gen:keys 재실행)", () => {
    expect([...translationKeys]).toEqual(leaves(ko));
  });
});
