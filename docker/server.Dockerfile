# syntax=docker/dockerfile:1.7
#
# AideTalk server(Hono API + WS 게이트웨이) 프로덕션 이미지.
# 셀프호스팅과 클라우드가 동일 이미지를 쓴다(docs/10_DEPLOYMENT.md §0, §3).
# 빌드 컨텍스트는 모노레포 루트(docker/compose.yml에서 `context: ..`로 지정).
#
# 멀티스테이지 구성:
#   base    - pnpm 활성화만 한 공통 베이스
#   build   - 전체 워크스페이스 설치 + apps/server 빌드 + pnpm deploy로 해당 앱만 추출
#   runtime - 추출된 결과물만 담은 최소 실행 이미지 (non-root)

# 베이스 이미지: node:22-alpine (08_SECURITY.md §8에서 확정 — 크기·공격 표면 최소, healthcheck는 busybox wget 사용).
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# package.json의 packageManager 필드에 고정된 버전으로 pnpm을 활성화한다.
RUN corepack enable

FROM base AS build
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
# apps/server 빌드 = esbuild 번들(apps/server/build.mjs) → dist/index.js 단일 엔트리.
# 워크스페이스 패키지(@aidetalk/db·shared·i18n)는 소스 전용이라 번들에 인라인되고,
# 서드파티 npm 패키지만 external로 남아 아래 pnpm deploy의 node_modules에서 해석된다.
# 소스 전용 패키지(packages/*)는 build 스크립트가 없으므로 --if-present로 스킵 허용.
RUN pnpm --filter @aidetalk/server... run --if-present build
# 위젯(로더 widget.js + 본체 app.js)도 같은 이미지에 넣는다 — 서버가 /widget.js,
# /widget/v{n}/app.js를 서빙하므로(10 §3, 06 §1.1) 배포 단위가 서버 이미지 하나로 유지된다.
# 위젯은 서버의 워크스페이스 의존성이 아니라 위 --filter에 안 걸리므로 따로 빌드한다.
RUN pnpm --filter @aidetalk/widget build
# 프로덕션 의존성 트리 + 빌드 산출물만 /repo/out/server로 추출 (pnpm deploy).
RUN pnpm --filter @aidetalk/server deploy --prod /repo/out/server

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo/out/server ./
# 마이그레이션 SQL(RUN_MIGRATIONS_ON_BOOT=true일 때 사용).
# packages/db의 runMigrations는 폴더를 `new URL("../drizzle", import.meta.url)`로 찾는데,
# 번들된 코드의 import.meta.url은 /app/dist/index.js이므로 그 기준 경로가 /app/drizzle이 된다.
# (pnpm deploy는 node_modules/@aidetalk/db 아래에 넣으므로 그 경로로는 찾지 못한다.)
COPY --from=build --chown=node:node /repo/packages/db/drizzle ./drizzle
# 위젯 산출물 — apps/server/src/routes/widget-assets.ts의 resolveWidgetDistDir()가
# 번들(/app/dist/index.js) 기준 `../widget` = /app/widget에서 찾는다(드리즐과 동일한 패턴).
COPY --from=build --chown=node:node /repo/apps/widget/dist ./widget
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1
CMD ["node", "dist/index.js"]
