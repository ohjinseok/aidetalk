# syntax=docker/dockerfile:1.7
#
# AideTalk dashboard(Next.js 16 App Router) 프로덕션 이미지.
# 셀프호스팅과 클라우드가 동일 이미지를 쓴다(docs/10_DEPLOYMENT.md §0, §3).
# 빌드 컨텍스트는 모노레포 루트(docker/compose.yml에서 `context: ..`로 지정).

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
# @aidetalk/i18n, @aidetalk/shared 등 워크스페이스 의존 패키지도 함께 빌드 대상에 포함.
RUN pnpm --filter @aidetalk/dashboard... run --if-present build
# 프로덕션 의존성 트리 + .next 빌드 산출물만 /repo/out/dashboard로 추출.
# next.config.mjs의 transpilePackages(@aidetalk/i18n, @aidetalk/shared) 소스도
# pnpm deploy가 워크스페이스 의존성으로 함께 복사한다.
RUN pnpm --filter @aidetalk/dashboard deploy --prod /repo/out/dashboard

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo/out/dashboard ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1
# pnpm/corepack 없이도 뜨도록 로컬 next 바이너리를 직접 실행한다.
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
