import { describe, expect, it } from "vitest";

import { DB_PACKAGE_NAME } from "../index";

describe("@aidetalk/db (placeholder)", () => {
  it("패키지가 로드되고 placeholder export를 노출한다", () => {
    expect(DB_PACKAGE_NAME).toBe("@aidetalk/db");
  });
});
