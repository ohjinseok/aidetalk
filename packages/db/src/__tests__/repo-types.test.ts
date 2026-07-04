/**
 * 타입 테스트 — repo 함수 시그니처가 workspaceId를 첫 인자로 강제하는지 검증.
 * expectTypeOf 단언은 tsc(pnpm typecheck)에서도 컴파일 에러로 잡힌다(이중 안전).
 * CLAUDE.md 규칙 11(workspaceId 필수) + 규칙 9(assist는 memberContext 필수)를 타입으로 고정.
 */
import { describe, expectTypeOf, it } from "vitest";

import type { CreateWorkspaceInput, MemberContext, Repos } from "../repos";

describe("repo 시그니처 타입 강제", () => {
  it("workspace-scoped repo는 첫 인자가 workspaceId(string)여야 한다", () => {
    expectTypeOf<Parameters<Repos["member"]["invite"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<Repos["agent"]["create"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<Repos["visitor"]["getOrCreateByToken"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<Repos["conversation"]["create"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<Repos["message"]["append"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<Repos["event"]["append"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<Repos["agentLog"]["append"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<Repos["trackedLink"]["createMany"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<Repos["conversion"]["create"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<Repos["assist"]["append"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<Repos["webhook"]["create"]>[0]>().toEqualTypeOf<string>();
  });

  it("workspaceId는 필수(선택 불가) — 인자 없이는 호출 불가", () => {
    // 첫 인자를 생략한 호출은 타입 에러여야 한다.
    // @ts-expect-error workspaceId 없이 호출 금지
    expectTypeOf<Repos["conversation"]["create"]>().toBeCallableWith();
  });

  it("assist 조회/변경은 MemberContext 필수(visitor 접근 차단 — 규칙 9)", () => {
    expectTypeOf<Parameters<Repos["assist"]["listByConversation"]>>().toEqualTypeOf<
      [string, string, MemberContext]
    >();
    expectTypeOf<Parameters<Repos["assist"]["setOutcome"]>>().toEqualTypeOf<
      [string, string, "accepted" | "edited" | "ignored", MemberContext]
    >();
  });

  it("워크스페이스 밖 리소스는 예외 — workspaceRepo.create/userRepo는 workspaceId를 받지 않는다", () => {
    // workspace.create는 워크스페이스를 생성하므로 첫 인자가 입력 객체.
    expectTypeOf<Parameters<Repos["workspace"]["create"]>[0]>().toEqualTypeOf<CreateWorkspaceInput>();
    // userRepo는 전역(auth) 리소스 — getByEmail 첫 인자는 email.
    expectTypeOf<Parameters<Repos["user"]["getByEmail"]>[0]>().toEqualTypeOf<string>();
  });
});
