# 10_DEPLOYMENT.md — 배포 & 환경변수

> 셀프호스팅 수용 기준: "모르는 사람이 README만 보고 30분 안에 띄운다."
> 셀프호스팅과 클라우드는 **같은 Docker 이미지** — 차이는 환경변수(EDITION)뿐.

## 1. 환경변수 표 (단일 출처 — `.env.example`은 이 표에서 생성)

| 변수 | 기본값 | 필수 | 설명 |
|---|---|---|---|
| `DATABASE_URL` | - | ✅ | Postgres 연결 문자열 |
| `REDIS_URL` | - | PUBSUB=redis일 때 | |
| `PUBSUB_DRIVER` | `redis` | | `redis` \| `memory`(단일 프로세스 전용) |
| `STORAGE_DRIVER` | `local` | | `local` \| `s3` |
| `STORAGE_LOCAL_PATH` | `/data/files` | local일 때 | |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | - | s3일 때 | R2/MinIO 호환 |
| `SERVER_URL` | - | ✅ | 외부 공개 URL (위젯 임베드/링크 태깅 기준) |
| `DASHBOARD_URL` | - | ✅ | CORS/초대 링크 기준 |
| `PORT` | `4000` | | |
| `VISITOR_TOKEN_SECRET` | - | ✅ | 32바이트+ 랜덤 |
| `SESSION_SECRET` | - | ✅ | 〃 |
| `SECRET_ENC_KEY` | (없음) | | agent/웹훅 secret AES-256-GCM 암호화 전용 키(32바이트, hex 또는 base64). 미설정 시 SESSION_SECRET 파생으로 폴백 + 부팅 경고 로그(08 §1). 세션 키 로테이션과 분리하려면 설정 권장 |
| `EDITION` | (없음) | | `cloud`면 ee 모듈 로드(PlanEnforcer/Billing). 미설정 = 셀프호스팅 |
| `ALLOW_INSECURE_AGENT_ENDPOINT` | `false` | | 셀프호스팅에서 http 에이전트 허용 |
| `SMTP_URL` | (없음) | | 없으면 이메일 발송 전부 skip + 로그 (셀프호스팅 기본 동작) |
| `LOG_LEVEL` | `info` | | pino |
| `TELEMETRY` | `false` | | opt-in 익명 텔레메트리 (수집 항목: 설치 UUID, 버전, 워크스페이스 수 — 문서에 명시) |
| (ee) `BILLING_PROVIDER` + 해당 시크릿 | - | cloud | PG 미정(TODO) — 01 §6 BillingProvider 구현체 선택 |
| (ee) `BILLING_KEY_ENC_KEY` | - | cloud | billingKey 암호화 키 |

부팅 시 zod로 env 검증(`apps/server/src/env.ts`) — 누락 시 어떤 변수가 왜 필요한지 출력 후 종료.

## 2. 셀프호스팅 (docker/compose.yml)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_DB: aidetalk, POSTGRES_USER: aidetalk, POSTGRES_PASSWORD: ${DB_PASSWORD} }
    volumes: [ pgdata:/var/lib/postgresql/data ]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U aidetalk"], interval: 5s, retries: 10 }
  redis:
    image: redis:7-alpine
  server:
    image: ghcr.io/{org}/aidetalk-server:latest   # 로컬 빌드: build: { context: .., dockerfile: docker/server.Dockerfile }
    depends_on: { postgres: { condition: service_healthy }, redis: { condition: service_started } }
    environment:
      DATABASE_URL: postgres://aidetalk:${DB_PASSWORD}@postgres:5432/aidetalk
      REDIS_URL: redis://redis:6379
      SERVER_URL: ${SERVER_URL}
      DASHBOARD_URL: ${DASHBOARD_URL}
      VISITOR_TOKEN_SECRET: ${VISITOR_TOKEN_SECRET}
      SESSION_SECRET: ${SESSION_SECRET}
      SECRET_ENC_KEY: ${SECRET_ENC_KEY:-}
    ports: [ "4000:4000" ]
    volumes: [ files:/data/files ]
    # 부팅 엔트리포인트에서 pnpm db:migrate 자동 실행 (마이그레이션 → 서버 기동)
  dashboard:
    image: ghcr.io/{org}/aidetalk-dashboard:latest
    environment: { NEXT_PUBLIC_SERVER_URL: ${SERVER_URL} }
    ports: [ "3000:3000" ]
volumes: { pgdata: {}, files: {} }
```

설치 절차(README에 그대로):
```bash
git clone https://github.com/{org}/aidetalk && cd aidetalk/docker
cp .env.example .env   # DB_PASSWORD/시크릿 채우기 — 시크릿 생성: openssl rand -hex 32
docker compose up -d
# dashboard http://localhost:3000 → 가입 → 워크스페이스 생성 → 임베드 코드 복사
```
- TLS: 프로덕션은 리버스 프록시 필수 — Caddy 2블록 예시를 docs 사이트에 제공 (`reverse_proxy /ws/* server:4000` 포함, WS 업그레이드 주의).
- 업그레이드: `docker compose pull && docker compose up -d` (마이그레이션은 엔트리포인트가 처리). 메이저 업그레이드 시 pg_dump 백업 권고 문구.

## 3. Dockerfile 요건
- 멀티스테이지: `pnpm fetch` 캐시 → build → `node:22-slim` 런타임, non-root(`USER node`), `HEALTHCHECK CMD wget -qO- localhost:4000/healthz`.
- 위젯 정적 파일은 server 이미지에 포함(`/widget.js`, `/widget/v{n}/app.js` 서빙) — 배포 단위 최소화.

## 4. 클라우드 (M3, 내부 운영)
- 구성: 단일 리전, 관리형 Postgres + Redis, server 1~2대(뒤에 LB, sticky 불필요 — PubSub이 fan-out), dashboard는 동일 서버군 or 정적 호스팅.
- `EDITION=cloud` + ee 환경변수. ee 마이그레이션은 별도 스텝(`pnpm --filter ee db:migrate`).
- 백업: pg_dump 일배치 → 오브젝트 스토리지(암호화, 30일). uptime 모니터링(healthz 외부 핑) + 실패 알림.
- 로그 보존 배치: `agentLogRepo.purgeOlderThan(planEnforcer.getLogRetentionDays)` 일 1회.

## 5. 릴리즈
- 버전: server/dashboard/widget 동일 버전 태깅(모노레포 단일 버전). `vX.Y.Z` 태그 push → GitHub Actions가 이미지 빌드/푸시 + 릴리즈 노트.
- 위젯 본체는 버전 경로(`/widget/v{n}/`)라 구 로더와도 호환 — 로더 변경은 최소화.
