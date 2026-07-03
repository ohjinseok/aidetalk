# docker/ — 배포용 Docker 리소스

셀프호스팅과 클라우드가 동일 이미지를 사용한다 (`docs/02_ARCHITECTURE.md`, `docs/10_DEPLOYMENT.md`).

## 상태

M0 단계 — 아직 빈 상태(placeholder README만).
`docker compose -f docker/compose.yml up -d`로 postgres + redis + server(healthz 200) + dashboard를
띄우는 `compose.yml` 초안은 별도 로드맵 항목(`docs/11_ROADMAP.md` M0 "docker/compose.yml 초안")에서
작업한다.
