/* global process */
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 워크스페이스 내 TS 소스 패키지(빌드 산출물 없음)를 Next가 직접 트랜스파일하도록 등록.
  transpilePackages: ["@aidetalk/i18n", "@aidetalk/shared"],

  // 서버 API 프록시 — 로컬 개발(pnpm dev) 전용. rewrites는 next build 시점에 평가되어
  // 이미지에 고정되므로, 프로덕션(Docker)에서는 런타임 env를 반영하지 못해 신뢰할 수 없다.
  // 프로덕션에서는 Caddy가 단일 진입점으로 /api/*(프리픽스 제거) → server, /ws/* → server,
  // 나머지 → dashboard를 라우팅하므로 대시보드·서버가 항상 동일 오리진이며 이 rewrites는 쓰이지 않는다.
  async rewrites() {
    const server = process.env.SERVER_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${server}/:path*` }];
  },
};

export default nextConfig;
