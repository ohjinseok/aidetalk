/* global process */
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 워크스페이스 내 TS 소스 패키지(빌드 산출물 없음)를 Next가 직접 트랜스파일하도록 등록.
  transpilePackages: ["@aidetalk/i18n", "@aidetalk/shared"],

  // 서버 API 프록시 — 10 문서: /api/* → {SERVER_URL}/* (쿠키 동일 오리진 전달, SameSite 이슈 회피).
  // WebSocket(/ws/*)은 rewrites가 업그레이드를 프록시하지 못하므로 NEXT_PUBLIC_WS_URL로 직접 접속(ws/client.ts 참고).
  async rewrites() {
    const server = process.env.SERVER_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${server}/:path*` }];
  },
};

export default nextConfig;
