/**
 * drizzle-kit 설정 — 마이그레이션 생성/적용.
 * `pnpm db:generate`가 이 설정으로 drizzle/ 아래 SQL을 만든다.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // generate에는 불필요, push/migrate 시 사용.
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/aidetalk",
  },
  // 컬럼명을 스키마에서 명시적으로 지정하므로 자동 casing 변환은 끈다.
  strict: true,
  verbose: true,
});
