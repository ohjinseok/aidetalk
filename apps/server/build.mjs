/**
 * 서버 프로덕션 빌드 — esbuild 번들 → dist/index.js (package.json의 `start`/Dockerfile CMD가 가리키는 경로).
 *
 * 왜 tsc가 아니라 번들러인가(중요):
 *  1. 소스의 상대 import가 확장자 없는 형태다(`./app`). tsconfig가 moduleResolution: "Bundler"라
 *     타입체크·tsx/vite는 통과하지만, tsc는 확장자를 붙여주지 않으므로 산출물을 Node ESM이 못 읽는다
 *     (ERR_MODULE_NOT_FOUND). 전부 `.js`로 고치려면 서버·패키지 합쳐 400곳 이상을 바꿔야 한다.
 *  2. packages/*(@aidetalk/db·shared·i18n)는 소스 전용 패키지다(main이 `./src/index.ts`).
 *     컴파일된 JS가 없어서, tsc 산출물은 런타임에 .ts 파일을 import하게 된다.
 *  3. tsc는 include에 걸린 테스트까지 컴파일해 rootDir을 apps/server로 추론했고, 그 결과
 *     dist/src/·dist/test/가 생기고 dist/index.js는 아예 만들어지지 않았다.
 *
 *  → 워크스페이스 코드(@aidetalk/* + 상대 경로)를 전부 인라인하고 서드파티 npm 패키지만 external로
 *    남기면 위 셋이 한 번에 해결된다. 엔트리 그래프에 없는 테스트/harness는 자연히 제외된다.
 *
 * 타입체크는 여전히 tsc가 담당한다(`pnpm typecheck` = tsc --noEmit). esbuild는 타입을 보지 않는다.
 */
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  // 번들 대상: 상대 경로 + @aidetalk/* 워크스페이스 패키지.
  // 그 외 bare import(hono, ws, pino, drizzle-orm, postgres, ...)는 external로 두고
  // 런타임에 node_modules에서 해석한다(pnpm deploy --prod가 프로덕션 의존성 트리를 함께 넣는다).
  // 주의: 인라인된 @aidetalk/db가 쓰는 서드파티(drizzle-orm·postgres·hash-wasm·nanoid)는
  //       번들 이후 사실상 서버의 직접 런타임 의존성이 되므로 apps/server/package.json에 명시해 둔다.
  plugins: [
    {
      name: "externalize-third-party",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) => {
          if (args.kind === "entry-point") return null;
          const isRelative = args.path.startsWith(".") || args.path.startsWith("/");
          const isWorkspace = args.path.startsWith("@aidetalk/");
          if (isRelative || isWorkspace) return null;
          return { path: args.path, external: true };
        });
      },
    },
  ],
  logLevel: "info",
});
