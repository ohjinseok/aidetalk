import { describe, expect, it } from "vitest";

import { ID_NANOID_SIZE, ID_PREFIXES, newId } from "../id";

describe("newId", () => {
  it("prefix_nanoid 형식으로 생성한다", () => {
    const id = newId("conv");
    expect(id).toMatch(new RegExp(`^conv_[A-Za-z0-9_-]{${ID_NANOID_SIZE}}$`));
  });

  it("모든 prefix에 대해 올바른 접두사를 붙인다", () => {
    for (const prefix of ID_PREFIXES) {
      expect(newId(prefix).startsWith(`${prefix}_`)).toBe(true);
    }
  });

  it("size 인자로 nanoid 길이를 조절한다", () => {
    expect(newId("tlk", 10)).toMatch(/^tlk_[A-Za-z0-9_-]{10}$/);
  });

  it("호출마다 고유한 ID를 만든다", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId("msg")));
    expect(ids.size).toBe(1000);
  });
});
