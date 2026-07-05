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
# apps/server와 워크스페이스 의존 패키지(현재는 없음, 추후 packages/shared 등 추가 대비)를 함께 빌드.
# 소스 전용 패키지(packages/*)는 build 스크립트가 없으므로 --if-present로 스킵 허용.
RUN pnpm --filter @aidetalk/server... run --if-present build
# 프로덕션 의존성 트리 + 빌드 산출물만 /repo/out/server로 추출 (pnpm deploy).
RUN pnpm --filter @aidetalk/server deploy --prod /repo/out/server

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo/out/server ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1
CMD ["node", "dist/index.js"]
