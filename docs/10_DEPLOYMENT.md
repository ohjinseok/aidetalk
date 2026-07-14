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
| `PUBLIC_URL` | `http://localhost` | | **단일 도메인 진입점** — Caddy 사이트 주소이자 SERVER_URL/DASHBOARD_URL의 파생 소스. scheme 포함(`https://cs.example.com`). https면 Caddy 자동 HTTPS+HTTP/3, http면 평문 |
| `SERVER_URL` | `PUBLIC_URL` 파생 | | 외부 공개 URL (위젯 임베드/링크 태깅 기준). 단일 도메인에선 PUBLIC_URL과 동일 — server/dashboard 오리진 분리 배포 시에만 명시 |
| `DASHBOARD_URL` | `PUBLIC_URL` 파생 | | CORS/초대 링크 기준. 단일 도메인에선 PUBLIC_URL과 동일 — 분리 배포 시에만 명시 |
| `PORT` | `4000` | | |
| `VISITOR_TOKEN_SECRET` | - | ✅ | 32바이트+ 랜덤 |
| `SESSION_SECRET` | - | ✅ | 〃 |
| `SECRET_ENC_KEY` | (없음) | | agent/웹훅 secret AES-256-GCM 암호화 전용 키(32바이트, hex 또는 base64). 미설정 시 SESSION_SECRET 파생으로 폴백 + 부팅 경고 로그(08 §1). 세션 키 로테이션과 분리하려면 설정 권장 |
| `EDITION` | (없음) | | `cloud`면 ee 모듈 로드(PlanEnforcer/Billing). 미설정 = 셀프호스팅 |
| `ALLOW_INSECURE_AGENT_ENDPOINT` | `false` | | 에이전트/웹훅 endpoint SSRF 가드 완화 스위치. 기본(false)은 **에디션 무관** https + 공인 IP 강제 — 아래 §1-3 참고 |
| `ALLOW_PUBLIC_SIGNUP` | `false` | | 공개 회원가입 허용 여부. 기본값(false)이어도 **유저가 0명인 신규 인스턴스의 첫 가입**과 **초대받은 이메일의 가입**은 항상 허용된다 — 아래 §1-2 참고 |
| `SMTP_URL` | (없음) | | 없으면 이메일 발송 전부 skip + 로그 (셀프호스팅 기본 동작) |
| `LOG_LEVEL` | `info` | | pino |
| `TELEMETRY_ENABLED` | `false` | | **opt-in** 익명 텔레메트리. `true`일 때만 동작(기본 OFF) — 수집 항목은 아래 §1-1 표 참고 |
| `TELEMETRY_ENDPOINT` | placeholder 도메인(`https://telemetry.aidetalk.invalid/v1/ping`) | | 텔레메트리 전송 대상 URL. **TODO(action): 실제 수집 서버 도메인 확정 후 교체** |
| (ee) `BILLING_PROVIDER` + 해당 시크릿 | - | cloud | PG 미정(TODO) — 01 §6 BillingProvider 구현체 선택 |
| (ee) `BILLING_KEY_ENC_KEY` | - | cloud | billingKey 암호화 키 |

부팅 시 zod로 env 검증(`apps/server/src/env.ts`) — 누락 시 어떤 변수가 왜 필요한지 출력 후 종료.

### 1-1. 텔레메트리 수집 항목 (opt-in, 기본 OFF)

`TELEMETRY_ENABLED=true`로 명시적으로 켰을 때만 동작한다. 대화 내용·메시지·이메일 등 어떤 PII도
수집하지 않으며, 아래 항목이 전부다. 주 1회 `TELEMETRY_ENDPOINT`로 전송하고, 전송 실패는 조용히
무시한다(서버 동작에 영향 없음). 구현: `apps/server/src/services/telemetry.ts`,
`packages/db/src/repos/instance.ts`.

| 항목 | 설명 |
|---|---|
| 인스턴스 익명 ID | 최초 전송 시 랜덤 생성해 DB(`instance_settings` 단일 행)에 저장. 재설치 시 새로 생성됨 — 사람/조직 식별 불가 |
| 버전 | 서버 버전(`apps/server/package.json`) |
| 워크스페이스 개수 | 인스턴스 전체 워크스페이스 "수"만 (이름/설정 등 내용 없음) |
| 대화 개수 | 인스턴스 전체 대화 "수"만 (메시지 본문/방문자 정보 없음) |
| 에이전트(커넥터) 개수 | 등록된 AI 커넥터 "수"만 (엔드포인트 URL/시크릿 등 없음) |

### 1-2. 회원가입 정책 (`ALLOW_PUBLIC_SIGNUP`, 기본 `false`)

인터넷에 노출된 인스턴스에서 아무나 계정을 만들 수 있으면 계정 스팸·자원 남용(가입 1건마다
argon2id 해싱 19MiB)이 가능하다. 그래서 기본은 **닫힘**이고, 잠기지 않도록 두 가지 예외를 둔다.

| 상황 | `ALLOW_PUBLIC_SIGNUP=false`(기본) | `=true` |
|---|---|---|
| 인스턴스에 유저 0명(설치 직후) | ✅ 허용 — 첫 관리자 계정 | ✅ |
| 유저가 1명 이상 + 초대 없는 가입 시도 | ❌ `403 auth/forbidden` | ✅ |
| 유효한(미수락·미만료) 초대를 받은 이메일 | ✅ 허용 | ✅ |

운영 시나리오(기본값 그대로):
1. `docker compose up -d` → 브라우저로 접속 → **첫 가입이 곧 관리자 계정**(유저 0명이라 허용).
2. 그 순간부터 공개 가입은 자동으로 닫힌다. 외부인이 `/signup`을 열어 가입을 시도하면
   "공개 가입이 비활성화되어 있습니다 — 관리자에게 초대를 요청하세요" 안내를 받는다.
3. 팀원 합류는 워크스페이스 설정 > 멤버에서 **초대**로 한다. 초대받은 이메일은 미가입 상태여도
   초대 링크(`/signup?inviteToken=...`)로 정상 가입된다.
4. 사내 위키처럼 누구나 가입해도 되는 환경이면 `.env`에 `ALLOW_PUBLIC_SIGNUP=true`를 넣고
   `docker compose up -d`로 재적용한다.

가입 시도는 IP당 **5회/시간**으로 제한된다(초과 시 `429 rate/limited`, 08 §3).

### 1-3. 에이전트/웹훅 endpoint 정책 (`ALLOW_INSECURE_AGENT_ENDPOINT`, 기본 `false`)

서버는 에이전트 커넥터와 웹훅으로 **아웃바운드 요청을 보내는 주체**다. 그래서 endpoint 주소는
등록 시점과 발송 직전(DNS 리바인딩 대비) 두 번 검사한다(08 §2·§7).

| 값 | 스킴 | 리졸브된 IP | 용도 |
|---|---|---|---|
| `false` (기본, 클라우드는 항상 이 모드) | **https만** | **공인 IP만** — 사설/루프백/내부망(10/8, 172.16/12, 192.168/16, 127/8, `::1`, `fc00::/7`)은 거부 | 인터넷에 공개된 에이전트에 붙일 때 |
| `true` | http도 허용 | 사설/내부 IP 허용 | 같은 도커 네트워크·LAN에 띄운 **자기 에이전트**(`http://my-agent:8080`, `http://192.168.1.10:3000`)에 붙일 때 |

- **왜 기본이 `false`인가:** 이 검사가 꺼져 있으면 워크스페이스 멤버가 endpoint를
  `http://169.254.169.254/...`(클라우드 메타데이터)나 사내망 주소로 지정할 수 있고, 서버가 그리로 요청을 보낸 뒤
  응답이 상담 화면에 노출된다(SSRF — 인스턴스 자격증명/내부 정보 유출). AWS·GCP VM에 셀프호스팅하면 실제 위험이다.
- **언제 `true`로 켜나:** 에이전트를 같은 compose 네트워크나 사내망에 두는 경우. 켜면 서버가
  **워크스페이스 멤버가 지정한 내부망 주소로 요청을 보낼 수 있게 된다** — 멤버가 전부 신뢰할 수 있는 내부 인원일 때만 켤 것.
  외부인이 워크스페이스에 들어올 수 있는 인스턴스라면 켜지 마라.
- **켜도 항상 차단되는 것:** 링크로컬/클라우드 메타데이터 대역(`169.254.0.0/16`, `fe80::/10`, `fd00:ec2::254`).
  자기 에이전트를 메타데이터 주소에 둘 이유는 없고, 유출 피해만 크기 때문이다.
- 로컬 개발(`http://localhost:5000`의 예제 에이전트)도 이 값을 `true`로 두어야 한다.

## 2. 셀프호스팅 (docker/compose.yml)

**Caddy 리버스 프록시가 기본 동봉**되어 유일한 공개 진입점(80/443)이 된다. 단일 도메인 + 경로
라우팅으로 server/dashboard를 뒤에 두므로, 호스트 포트를 직접 노출하지 않고 TLS까지 자동 처리된다.
compose 서비스 구성은 `docker/compose.yml`, 라우팅은 `docker/Caddyfile`이 단일 출처다.

### 기본 절차 (도메인 + 자동 HTTPS)
```bash
# 1) DNS: 도메인 A 레코드 → 서버 공인 IP (443/80 인바운드 허용).
git clone https://github.com/{org}/aidetalk && cd aidetalk/docker
cp .env.example .env
# 2) .env 편집:
#    PUBLIC_URL=https://cs.example.com   # scheme 포함. https면 Caddy가 Let's Encrypt로 자동 발급
#    DB_PASSWORD/시크릿 채우기 — openssl rand -hex 32
docker compose up -d          # postgres+redis+server+dashboard+caddy 기동, 인증서 자동 발급
# → https://cs.example.com 접속 → 가입 → 워크스페이스 생성 → 임베드 코드 복사
```
- **로컬**: `PUBLIC_URL`을 비워두면 `http://localhost`로 뜬다(평문 HTTP, 인증서 경고 없음). `docker compose up`만으로 접속 가능.
- **HTTPS 조건**: `PUBLIC_URL`의 scheme이 `https://`이고 그 도메인이 이 서버로 향하는 DNS A 레코드를 가져야 Caddy가 ACME 인증서를 발급한다. 인증서/키는 `caddy_data` 볼륨에 영속된다(재기동 시 재발급 안 함).
- **마이그레이션**: 기본은 수동(`pnpm db:migrate`) 또는 `.env`에 `RUN_MIGRATIONS_ON_BOOT=true`로 부팅 자동화.
- **업그레이드**: `docker compose pull && docker compose up -d`. 메이저 업그레이드 전 `pg_dump` 백업 권고.

### 라우팅 표 (Caddyfile 단일 출처 — 다른 프록시로 재현할 때 그대로 사용)
| 경로 | 프리픽스 | 대상 | 근거 |
|---|---|---|---|
| `/api/*` | **제거** (`/api` strip) | `server:4000` | 대시보드 REST 클라이언트(base=`/api`) → 서버는 `/api` 프리픽스 없음 |
| `/v1/*` | 보존 | `server:4000` | 위젯/방문자 REST (`/v1/widget/*` 등), 외부 오리진에서 직접 호출 |
| `/t/*` | 보존 | `server:4000` | 전환 트래킹 클릭/픽셀 — 위젯 로더가 외부 오리진에서 직접 호출 |
| `/ws/*` | 보존 | `server:4000` | WebSocket (`/ws/visitor`, `/ws/agent`) — Upgrade 전달 필수 |
| `/widget.js` | 보존 | `server:4000` | 위젯 로더 스크립트(서버 이미지가 서빙, §3) |
| `/widget/*` | 보존 | `server:4000` | 위젯 본체 `/widget/v{n}/app.js` |
| `/healthz` | 보존 | `server:4000` | 헬스체크 |
| 그 외 전부 | 보존 | `dashboard:3000` | Next.js UI (`/_next/*` 정적 자산 포함) |

### 기존 리버스 프록시 사용자
이미 Traefik/Nginx/Caddy 등을 운영 중이라 동봉 Caddy가 불필요하면:
1. `docker compose up -d`에 `--scale caddy=0`을 주거나, `compose.yml`의 `caddy` 서비스를 삭제/주석 처리한다.
2. server/dashboard를 기존 프록시에 붙이려면 두 서비스의 `expose`를 `ports`로 바꿔 호스트에 노출한다
   (예: `ports: ["4000:4000"]`, `["3000:3000"]`). 그다음 위 **라우팅 표를 그대로** 자신의 프록시에 옮긴다.
3. server/dashboard를 **서로 다른 오리진**으로 분리 배포하면 `.env`에 `SERVER_URL`/`DASHBOARD_URL`을 각각
   명시한다(단일 도메인이면 `PUBLIC_URL`만으로 파생됨 — §1).

**WebSocket 주의**: 어떤 프록시든 `/ws/*`에서 `Upgrade`/`Connection` 헤더를 전달해야 한다. 누락 시 대시보드가
조용히 무한 재연결한다.

<details><summary>Traefik 라벨 예시 (server 서비스)</summary>

```yaml
labels:
  - "traefik.enable=true"
  # /api/* → 프리픽스 제거 후 server
  - "traefik.http.routers.at-api.rule=Host(`cs.example.com`) && PathPrefix(`/api`)"
  - "traefik.http.routers.at-api.middlewares=at-stripapi"
  - "traefik.http.middlewares.at-stripapi.stripprefix.prefixes=/api"
  # /v1,/t,/ws,/widget,/healthz → 프리픽스 보존 후 server
  - "traefik.http.routers.at-srv.rule=Host(`cs.example.com`) && (PathPrefix(`/v1`) || PathPrefix(`/t`) || PathPrefix(`/ws`) || PathPrefix(`/widget`) || Path(`/widget.js`) || Path(`/healthz`))"
  - "traefik.http.services.at-srv.loadbalancer.server.port=4000"
  # 대시보드는 별도 라우터(우선순위 낮게)로 나머지를 잡는다: Host(`cs.example.com`) → dashboard:3000
```
Traefik은 WebSocket을 자동 처리하므로 `/ws/*`에 별도 설정은 불필요하다.
</details>

- **Nginx Proxy Manager / 일반 nginx**: `location /api/ { proxy_pass http://server:4000/; }`(끝 슬래시로 `/api` 제거),
  `/v1 /t /ws /widget.js /widget/ /healthz`는 `proxy_pass http://server:4000;`(슬래시 없이 프리픽스 보존),
  나머지는 `proxy_pass http://dashboard:3000;`. `/ws/`에는 반드시
  `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_http_version 1.1;`를 넣는다.

## 3. Dockerfile 요건
- 멀티스테이지: build(전체 워크스페이스 설치 + 빌드 + `pnpm deploy --prod`) → `node:22-alpine` 런타임, non-root(`USER node`), `HEALTHCHECK CMD wget -qO- localhost:4000/healthz`.
- 위젯 정적 파일은 server 이미지에 포함(`/widget.js`, `/widget/v{n}/app.js` 서빙) — 배포 단위 최소화.

### 3-1. 위젯 정적 자산 서빙 (구현: `apps/server/src/routes/widget-assets.ts`)
| 경로 | 파일 | Cache-Control | 근거 |
|---|---|---|---|
| `/widget.js` | `app.js`가 아닌 로더 | `public, max-age=300` | 유저 사이트에 박힌 고정 URL — 재배포가 5분 내 반영(06 §1.1) |
| `/widget/v{n}/app.js` | 위젯 본체 | `public, max-age=31536000, immutable` | 버전이 URL에 있어 내용이 바뀌면 URL도 바뀜(06 §1.1) |

- 버전 `n`의 단일 출처는 `@aidetalk/shared`의 `WIDGET_VERSION`. 로더는 빌드 시 같은 값을 주입받고(`apps/widget/version.ts` + 가드 테스트), 서버는 그 버전 경로만 서빙한다(다른 버전 요청은 404).
- 이미지 레이아웃: `server.Dockerfile`이 build 스테이지에서 `pnpm --filter @aidetalk/widget build` 후 `apps/widget/dist`를 `/app/widget`으로 COPY한다. 서버는 번들(`/app/dist/index.js`) 기준 `../widget`에서 찾는다(마이그레이션 폴더 `/app/drizzle`과 동일한 패턴). 개발(tsx)에서는 `apps/widget/dist`를 자동으로 찾고, 위젯 미빌드 시에는 404 + 경고 로그만 남기고 서버는 정상 기동한다.
- 정적 JS라 CORS가 필요 없지만(`<script>` 로드), 공개 자산이므로 `Access-Control-Allow-Origin: *` + `X-Content-Type-Options: nosniff`를 함께 내려준다.
- 리버스 프록시는 `/widget.js`·`/widget/*`를 server로 넘겨야 한다(§2 라우팅 표, `docker/Caddyfile`에 반영됨).

## 4. 클라우드 (M3, 내부 운영)
- 구성: 단일 리전, 관리형 Postgres + Redis, server 1~2대(뒤에 LB, sticky 불필요 — PubSub이 fan-out), dashboard는 동일 서버군 or 정적 호스팅.
- `EDITION=cloud` + ee 환경변수. ee 마이그레이션은 별도 스텝(`pnpm --filter ee db:migrate`).
- 백업: pg_dump 일배치 → 오브젝트 스토리지(암호화, 30일). uptime 모니터링(healthz 외부 핑) + 실패 알림.
- 로그 보존 배치: `agentLogRepo.purgeOlderThan(planEnforcer.getLogRetentionDays)` 일 1회.

## 5. 릴리즈
- 버전: server/dashboard/widget 동일 버전 태깅(모노레포 단일 버전). `vX.Y.Z` 태그 push → GitHub Actions가 이미지 빌드/푸시 + 릴리즈 노트.
- 위젯 본체는 버전 경로(`/widget/v{n}/`)라 구 로더와도 호환 — 로더 변경은 최소화.
