# docker/ — 배포용 Docker 리소스

셀프호스팅과 클라우드가 동일 이미지를 사용한다 (`docs/02_ARCHITECTURE.md`, `docs/10_DEPLOYMENT.md`).

## 상태

`postgres + redis + server(healthz 200) + dashboard + caddy`가 `compose.yml`로 기동한다.
**Caddy가 유일한 공개 진입점(80/443)**이며 단일 도메인 + 경로 라우팅으로 server/dashboard를 뒤에 둔다
(라우팅 표·설계 근거는 `docs/10_DEPLOYMENT.md` §2, 라우팅 단일 출처는 `Caddyfile`).
server는 `RUN_MIGRATIONS_ON_BOOT=true` 환경변수로 부팅 시 자동 마이그레이션을 지원하지만,
이 compose 파일은 기본값(false)을 그대로 쓰므로 `pnpm db:migrate`를 수동 실행하거나
`.env`에 해당 값을 켜서 자동화한다.

## 파일

- `compose.yml` — postgres:16-alpine, redis:7-alpine, server, dashboard, **caddy:2-alpine** 서비스 정의.
  server/dashboard는 호스트 포트 미노출(`expose`), 진입점은 caddy 하나뿐.
- `Caddyfile` — 리버스 프록시 라우팅. `/api/*`(프리픽스 제거)·`/v1 /t /ws /widget.js /widget/* /healthz`(보존)
  → server, 나머지 → dashboard. 사이트 주소는 `PUBLIC_URL`로 주입(미설정 시 `http://localhost`).
- `server.Dockerfile` / `dashboard.Dockerfile` — 멀티스테이지(pnpm install → 빌드 → `pnpm deploy --prod`로
  해당 앱만 추출) → `node:22-alpine` 런타임, non-root(`node`).
- `.env.example` — 환경변수 표(`docs/10_DEPLOYMENT.md` §1)의 로컬 실행용 예시. 시크릿은 placeholder이며
  실제 값은 `openssl rand -hex 32`로 생성해 채운다.

## 사용법

```bash
cp docker/.env.example docker/.env   # 값 채우기 (시크릿은 openssl rand -hex 32)
# 로컬: PUBLIC_URL 비워두면 http://localhost. 프로덕션: PUBLIC_URL=https://cs.example.com (DNS A 레코드 필요)
docker compose -f docker/compose.yml up -d --build
curl localhost/healthz               # {"ok":true} — caddy 경유
open http://localhost                 # 대시보드(로컬 기본)
docker compose -f docker/compose.yml down -v   # 정리 (볼륨까지 삭제)
```

기존 리버스 프록시를 이미 운영 중이라면 caddy 서비스를 빼고 붙이는 방법은 `docs/10_DEPLOYMENT.md` §2
"기존 리버스 프록시 사용자"를 참고한다.
