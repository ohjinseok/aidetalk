import { describe, expect, it } from "vitest";

import { SHARED_PACKAGE_NAME } from "../index";

describe("@aidetalk/shared (placeholder)", () => {
  it("패키지가 로드되고 placeholder export를 노출한다", () => {
    expect(SHARED_PACKAGE_NAME).toBe("@aidetalk/shared");
  });
});
