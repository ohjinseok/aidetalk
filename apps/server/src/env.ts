/**
 * 환경변수 zod 검증 — 10_DEPLOYMENT.md §1 표가 단일 출처.
 * 부팅 시 검증해 누락/오류면 어떤 변수가 왜 필요한지 출력 후 종료(index.ts).
 * 시크릿 값은 로그에 남기지 않는다(CLAUDE.md 규칙 5).
 */
import { z } from "zod";

/**
 * 불린 문자열("true"/"1") → boolean. 미설정 시 def.
 * ""는 parseEnv의 전역 정규화(normalizeEmptyStrings)에서 이미 undefined로 바뀌므로
 * 여기서 v === undefined만 확인해도 충분하지만, envSchema가 정규화 없이 직접 호출되는
 * 경우(예: 향후 다른 진입점)에 대비해 방어적으로 ""도 함께 처리한다.
 */
const boolish = (def: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === "") return def;
    return v === "true" || v === "1" || v === true;
  }, z.boolean());

/**
 * 서버 env 스키마. 필수 항목 누락 시 검증 실패.
 * PUBSUB_DRIVER=redis일 때 REDIS_URL 필수(refine).
 * 주의: 이 스키마는 항상 parseEnv를 통해서만 사용한다 — parseEnv가 빈 문자열을
 * undefined로 정규화한 뒤 파싱하므로, .env에 `KEY=`처럼 값 없이 남겨진 선택 필드가
 * optional/default 필드라면 undefined·기본값으로, 필수 필드라면 명확한 "누락" 에러로 처리된다.
 */
export const envSchema = z
  .object({
    DATABASE_URL: z.string({ required_error: "Postgres 연결 문자열이 필요하다." }).min(
      1,
      "Postgres 연결 문자열이 필요하다.",
    ),
    REDIS_URL: z.string().optional(),
    PUBSUB_DRIVER: z.enum(["redis", "memory"]).default("redis"),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_PATH: z.string().default("/data/files"),
    SERVER_URL: z
      .string({ required_error: "위젯 임베드/링크 태깅 기준 공개 URL이 필요하다." })
      .min(1, "위젯 임베드/링크 태깅 기준 공개 URL이 필요하다."),
    DASHBOARD_URL: z
      .string({ required_error: "CORS/초대 링크 기준 대시보드 URL이 필요하다." })
      .min(1, "CORS/초대 링크 기준 대시보드 URL이 필요하다."),
    PORT: z.coerce.number().int().positive().default(4000),
    VISITOR_TOKEN_SECRET: z
      .string({ required_error: "32바이트+ 랜덤 시크릿이 필요하다." })
      .min(16, "32바이트+ 랜덤 시크릿이 필요하다."),
    SESSION_SECRET: z
      .string({ required_error: "32바이트+ 랜덤 시크릿이 필요하다." })
      .min(16, "32바이트+ 랜덤 시크릿이 필요하다."),
    /**
     * agent/webhook secret AES-256-GCM 암호화 전용 키(Stripe/Slack식 키 분리) — 08 §1.
     * 미설정 시 SESSION_SECRET 파생으로 폴백(부팅 시 경고 로그, lib/secret-enc-key.ts).
     * 설정 시 32바이트를 표현하는 hex(64자) 또는 base64/base64url 문자열이어야 한다.
     */
    SECRET_ENC_KEY: z.string().optional(),
    EDITION: z.enum(["cloud"]).optional(),
    ALLOW_INSECURE_AGENT_ENDPOINT: boolish(false),
    SMTP_URL: z.string().optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    /**
     * opt-in 익명 텔레메트리(기본 OFF) — 10_DEPLOYMENT.md 텔레메트리 표.
     * true일 때만 주 1회 익명 통계(인스턴스 익명 ID/버전/워크스페이스·대화·에이전트 개수)를 전송한다.
     * 내용/PII는 절대 수집하지 않으며, 전송 실패는 조용히 무시한다(services/telemetry.ts).
     */
    TELEMETRY_ENABLED: boolish(false),
    /**
     * 텔레메트리 전송 대상 URL.
     * TODO(action): placeholder 도메인이다 — 실제 수집 서버 도메인이 확정되면 이 기본값과
     * 10_DEPLOYMENT.md/apps/docs/guide/install.md의 환경변수 표를 함께 갱신할 것.
     */
    TELEMETRY_ENDPOINT: z.string().default("https://telemetry.aidetalk.invalid/v1/ping"),
    /** 부팅 시 마이그레이션 자동 실행 여부(도커 엔트리포인트 대체용). */
    RUN_MIGRATIONS_ON_BOOT: boolish(false),
    /**
     * 공개 회원가입 허용 여부(기본 false) — 08_SECURITY.md §3.
     * false여도 (1) 유저가 0명인 신규 인스턴스의 첫 가입, (2) 유효한 초대를 받은 이메일의 가입은
     * 항상 허용한다(부트스트랩/초대 흐름이 막히지 않게). 즉 기본 동작은
     * "첫 관리자 계정 생성 후 자동으로 공개 가입이 닫히고 이후에는 초대로만 합류".
     */
    ALLOW_PUBLIC_SIGNUP: boolish(false),
  })
  .superRefine((env, ctx) => {
    if (env.PUBSUB_DRIVER === "redis" && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "PUBSUB_DRIVER=redis일 때 REDIS_URL이 필요하다.",
      });
    }
    if (env.SECRET_ENC_KEY !== undefined && secretEncKeyByteLength(env.SECRET_ENC_KEY) !== 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SECRET_ENC_KEY"],
        message: "SECRET_ENC_KEY는 32바이트를 표현하는 hex 또는 base64 문자열이어야 한다.",
      });
    }
  });

/** hex(짝수 길이) 문자열의 디코딩 바이트 길이. hex가 아니면 null. */
function hexDecodedLength(value: string): number | null {
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) return null;
  return value.length / 2;
}

/** base64/base64url(패딩 선택) 문자열의 디코딩 바이트 길이. base64가 아니면 null. */
function base64DecodedLength(value: string): number | null {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return null;
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").length;
}

/** SECRET_ENC_KEY 후보 문자열이 표현하는 바이트 길이(hex 우선, 아니면 base64). 판정 불가면 null. */
export function secretEncKeyByteLength(value: string): number | null {
  return hexDecodedLength(value) ?? base64DecodedLength(value);
}

export type Env = z.infer<typeof envSchema>;

/**
 * env 값에서 빈 문자열("")을 undefined로 정규화한다.
 * docker-compose가 `KEY=` 형태(값 없이 비워둔 선택 변수)를 컨테이너에 전달하면 process.env에는
 * 빈 문자열로 들어오는데, zod는 ""와 undefined를 다르게 취급한다(옵셔널·기본값 필드가 빈 문자열에는
 * 반응하지 않음). .env.example의 선택 변수(EDITION, SECRET_ENC_KEY, SMTP_URL, S3_* 등)는
 * 모두 "미설정 = 빈 문자열"로 배포되므로, 파싱 전에 여기서 한 번에 undefined로 맞춰
 * optional()은 undefined로, default()가 있는 필드는 기본값으로 정상 처리되게 한다.
 */
function normalizeEmptyStrings(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    normalized[key] = value === "" ? undefined : value;
  }
  return normalized as NodeJS.ProcessEnv;
}

/**
 * process.env를 검증해 Env를 반환한다.
 * 실패 시 사람이 읽을 수 있는 메시지를 담은 Error를 throw(값 자체는 출력하지 않음).
 * 파싱 전에 빈 문자열 값을 undefined로 정규화한다(normalizeEmptyStrings) — 필수 문자열 필드는
 * required_error로 여전히 "누락" 에러를 명확히 낸다.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(normalizeEmptyStrings(source));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`환경변수 검증 실패:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
