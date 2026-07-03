/** @type {import('next').NextConfig} */
const nextConfig = {
  // 워크스페이스 내 TS 소스 패키지(빌드 산출물 없음)를 Next가 직접 트랜스파일하도록 등록.
  transpilePackages: ["@aidetalk/i18n", "@aidetalk/shared"],
};

export default nextConfig;
