/**
 * 환경변수 zod 검증 — 10_DEPLOYMENT.md §1 표가 단일 출처.
 * 부팅 시 검증해 누락/오류면 어떤 변수가 왜 필요한지 출력 후 종료(index.ts).
 * 시크릿 값은 로그에 남기지 않는다(CLAUDE.md 규칙 5).
 */
import { z } from "zod";

/** 불린 문자열("true"/"1") → boolean. 미설정 시 def. */
const boolish = (def: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === "") return def;
    return v === "true" || v === "1" || v === true;
  }, z.boolean());

/**
 * 서버 env 스키마. 필수 항목 누락 시 검증 실패.
 * PUBSUB_DRIVER=redis일 때 REDIS_URL 필수(refine).
 */
export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "Postgres 연결 문자열이 필요하다."),
    REDIS_URL: z.string().optional(),
    PUBSUB_DRIVER: z.enum(["redis", "memory"]).default("redis"),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_PATH: z.string().default("/data/files"),
    SERVER_URL: z.string().min(1, "위젯 임베드/링크 태깅 기준 공개 URL이 필요하다."),
    DASHBOARD_URL: z.string().min(1, "CORS/초대 링크 기준 대시보드 URL이 필요하다."),
    PORT: z.coerce.number().int().positive().default(4000),
    VISITOR_TOKEN_SECRET: z.string().min(16, "32바이트+ 랜덤 시크릿이 필요하다."),
    SESSION_SECRET: z.string().min(16, "32바이트+ 랜덤 시크릿이 필요하다."),
    EDITION: z.enum(["cloud"]).optional(),
    ALLOW_INSECURE_AGENT_ENDPOINT: boolish(false),
    SMTP_URL: z.string().optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    TELEMETRY: boolish(false),
    /** 부팅 시 마이그레이션 자동 실행 여부(도커 엔트리포인트 대체용). */
    RUN_MIGRATIONS_ON_BOOT: boolish(false),
  })
  .superRefine((env, ctx) => {
    if (env.PUBSUB_DRIVER === "redis" && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "PUBSUB_DRIVER=redis일 때 REDIS_URL이 필요하다.",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * process.env를 검증해 Env를 반환한다.
 * 실패 시 사람이 읽을 수 있는 메시지를 담은 Error를 throw(값 자체는 출력하지 않음).
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`환경변수 검증 실패:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
