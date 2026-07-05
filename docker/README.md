# docker/ — 배포용 Docker 리소스

셀프호스팅과 클라우드가 동일 이미지를 사용한다 (`docs/02_ARCHITECTURE.md`, `docs/10_DEPLOYMENT.md`).

## 상태

`postgres + redis + server(healthz 200) + dashboard`가 `compose.yml`로 기동한다.
서버는 `RUN_MIGRATIONS_ON_BOOT=true` 환경변수로 부팅 시 자동 마이그레이션을 지원하지만,
이 compose 파일은 기본값(false)을 그대로 쓰므로 `pnpm db:migrate`를 수동 실행하거나
`.env`에 해당 값을 켜서 자동화한다 (`docs/10_DEPLOYMENT.md` §2).

## 파일

- `compose.yml` — postgres:16-alpine, redis:7-alpine, server, dashboard 서비스 정의.
- `server.Dockerfile` / `dashboard.Dockerfile` — 멀티스테이지(pnpm install → 빌드 → `pnpm deploy --prod`로
  해당 앱만 추출) → `node:22-alpine` 런타임, non-root(`node`).
- `.env.example` — 환경변수 표(`docs/10_DEPLOYMENT.md` §1)의 로컬 실행용 예시. 시크릿은 placeholder이며
  실제 값은 `openssl rand -hex 32`로 생성해 채운다.

## 사용법

```bash
cp docker/.env.example docker/.env   # 값 채우기 (시크릿은 openssl rand -hex 32)
docker compose -f docker/compose.yml up -d --build
curl localhost:4000/healthz          # {"ok":true}
open http://localhost:3000
docker compose -f docker/compose.yml down -v   # 정리 (볼륨까지 삭제)
```
