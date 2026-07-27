# AideTalk

**내가 만든 AI Agent를 그대로 고객 채팅에 연결하는 오픈소스 CS 메신저.**
위젯 · 상담 인박스 · 핸드오프까지 갖춰져 있고, 셀프호스팅은 무료다.

[![CI](https://github.com/ohjinseok/aidetalk/actions/workflows/ci.yml/badge.svg)](https://github.com/ohjinseok/aidetalk/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/core-AGPL--3.0-blue.svg)](./LICENSE)
[![ee License](https://img.shields.io/badge/ee-commercial-lightgrey.svg)](./ee/LICENSE)

```bash
git clone https://github.com/ohjinseok/aidetalk.git && cd aidetalk/docker
cp .env.example .env          # 시크릿만 채우면 된다
docker compose up -d          # → http://localhost
```

---

## 뭐가 다른가

**LLM 호출을 우리가 하지 않는다.** AI 응답은 여러분이 만든 Agent 서버가 직접 처리하고,
AideTalk는 HTTP 커넥터로 그 Agent를 위젯·인박스에 연결하는 릴레이 역할만 한다.
그래서 OpenAI/Claude 키를 우리에게 맡길 일이 없고, **AI 상담 비용은 API 원가 그대로**다.

국내 CS 메신저들은 AI 상담을 건당으로 과금한다. 상담이 늘수록 비용이 선형으로 늘고,
어떤 모델을 쓸지·프롬프트를 어떻게 짤지도 우리가 정할 수 없다. AideTalk는 그 반대다 —
Agent는 여러분 것이고, 우리는 그 앞단의 인프라만 만든다.

| | AideTalk 셀프호스팅 | 일반 SaaS 무료 플랜 |
|---|---|---|
| 상담 이력 | 무제한 | 보통 30일 제한 |
| AI 상담 | 내 Agent, API 원가 | 상위 플랜 + 건당 과금 |
| 데이터 | 내 서버에만 | 벤더 인프라 |
| 상담원 수 | 제한 없음 | 좌석당 과금 |

## 화면

**상담 인박스** — AI 자동응답은 아웃라인 버블에 "AI" 칩, 핸드오프 후 상담원 답장은 솔리드 버블.
누가 답했는지 한눈에 구분된다.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/inbox-dark.png">
  <img alt="AideTalk 상담 인박스 — AI 자동응답과 상담원 핸드오프" src="docs/assets/inbox-light.png">
</picture>

**임베드 위젯** — Shadow DOM으로 호스트 사이트 CSS와 완전히 격리된다. 32KB gzip.

<img alt="AideTalk 채팅 위젯" src="docs/assets/widget.png" width="380">

## 기능

- **채팅 위젯** — Preact 기반, gzip 32KB. 카페24·아임웹 등 국내 커머스 플랫폼 임베드를 상정했다.
- **AI Agent 커넥터** — HTTP + HMAC 서명 계약만 지키면 언어·런타임 무관하게 연결된다.
  Claude API로 동작하는 예제가 Node·Python 두 벌 들어 있다.
- **핸드오프 & 인박스** — AI가 막히거나 손님이 요청하면 사람 상담원에게 실시간으로 넘어간다.
  대화 목록·검색·실시간 알림을 갖춘 대시보드가 포함된다.
- **상담 어시스트** — 상담원이 응대할 때 AI가 답변 초안을 제안한다. 제안은 상담원에게만 보이고
  손님에게는 절대 노출되지 않는다.
- **상담 기여 매출(추정)** — 링크 클릭과 전환을 추적해 상담이 매출로 이어졌는지 추정한다.
  인과를 확정하는 게 아니라 기여를 추정하는 도구다.
- **셀프호스팅 = 클라우드 동일 이미지** — 차이는 환경변수 하나뿐이다.

## 설치

필요한 것은 Docker와 Docker Compose v2뿐이다.

```bash
git clone https://github.com/ohjinseok/aidetalk.git && cd aidetalk/docker
cp .env.example .env
```

`.env`에서 시크릿 세 개만 채운다. 각각 `openssl rand -hex 32`로 만들면 된다.

```bash
DB_PASSWORD=...
VISITOR_TOKEN_SECRET=...
SESSION_SECRET=...
```

```bash
docker compose up -d
curl http://localhost/healthz     # {"ok":true}
```

`http://localhost`에 접속해 가입하면 그 계정이 관리자가 되고, 이후 공개 가입은 자동으로 닫힌다
(팀원은 초대로 합류한다). 워크스페이스를 만들고 위젯 설정 화면에서 임베드 코드를 복사해
사이트에 붙여넣으면 첫 대화를 받을 준비가 끝난다.

### 도메인 붙이기

`.env`에 공개 주소 한 줄을 적으면 Caddy가 Let's Encrypt 인증서를 자동으로 발급받는다.
DNS A 레코드가 서버를 가리키고 80·443이 열려 있어야 한다.

```bash
PUBLIC_URL=https://cs.example.com
```

이미 Traefik이나 Nginx Proxy Manager를 쓰고 있다면 동봉된 Caddy를 빼고 붙일 수 있다 —
라우팅 표와 설정 예시가 [배포 문서](./docs/10_DEPLOYMENT.md)에 있다.

## 내 Agent 연결하기

이미 Agent가 있다면 [Agent Protocol](./docs/05_AGENT_PROTOCOL.md)의 HTTP + HMAC 계약만
구현하면 된다. 없다면 바로 실행되는 예제가 두 언어로 준비되어 있다. 둘 다 Claude API로 FAQ에
답하고, 처리하지 못하는 요청은 사람에게 넘긴다.

```bash
cd examples/agent-node        # 또는 examples/agent-python
```

대시보드의 Agent 커넥터에서 새 Agent를 등록하고 Endpoint URL을 넣으면 secret이 발급된다.
그 값을 예제의 `.env`에 붙여넣고 "연결 테스트"를 누르면 끝이다.

> 기본 설정에서는 보안을 위해 HTTPS 공인 주소만 허용한다. 같은 도커 네트워크나 LAN에 띄운
> Agent에 붙이려면 `ALLOW_INSECURE_AGENT_ENDPOINT=true`가 필요하다. 트레이드오프는
> [배포 문서](./docs/10_DEPLOYMENT.md)에 정리해 두었다.

## 문서

구현 상세 문서는 저장소 `docs/` 아래에 전부 공개되어 있다.

- [아키텍처](./docs/02_ARCHITECTURE.md) · [데이터 모델](./docs/03_DATA_MODEL.md) · [API 명세](./docs/04_API_SPEC.md)
- [Agent Protocol](./docs/05_AGENT_PROTOCOL.md) — 외부에 공개된 커넥터 계약
- [위젯 스펙](./docs/06_WIDGET_SPEC.md) · [보안](./docs/08_SECURITY.md) · [배포](./docs/10_DEPLOYMENT.md)

사용자용 가이드 사이트는 `apps/docs/`에 있고, 로컬에서 바로 볼 수 있다.

```bash
pnpm --filter @aidetalk/docs dev
```

## 라이선스

**Open Core.** 코어(위젯 · 인박스 · Agent 커넥터 · 셀프호스팅에 필요한 전부)는
[AGPL-3.0](./LICENSE)이며 기능 제한이 없다.

클라우드 전용 코드(결제, 플랜 한도, 자동 백업)만 `ee/` 아래에서 [상용 라이선스](./ee/LICENSE)를
따른다. `ee/` 없이도 코어는 완전히 빌드되고 구동된다.

## 기여

버그 제보, 기능 제안, 코드 기여 모두 환영한다. 개발 환경 셋업과 PR 규칙, DCO 서명 방법은
[CONTRIBUTING.md](./CONTRIBUTING.md)에 있다. 행동 강령은
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md), 보안 취약점 제보는
[SECURITY.md](./SECURITY.md)를 참고한다.

---

## English

**AideTalk is an open-source customer support messenger that connects *your own* AI agent
to your website's chat.** It ships the parts you'd otherwise rebuild every time — an embeddable
widget, a shared agent inbox, AI-to-human handoff, and per-workspace isolation.

The core idea: **we never call an LLM.** Your agent server does, over a signed HTTP contract,
so your API keys stay yours and AI replies cost you provider rates rather than per-conversation
SaaS pricing. Bring any language or runtime — Node and Python examples are included.

Self-hosting is free under AGPL-3.0 with no feature limits. One `docker compose up -d` brings up
PostgreSQL, Redis, the server, the dashboard, and Caddy; set `PUBLIC_URL` to your domain and you
get automatic HTTPS. Docs live in [`docs/`](./docs), starting with
[the architecture overview](./docs/02_ARCHITECTURE.md) and
[the agent protocol](./docs/05_AGENT_PROTOCOL.md).

Built for Korean SMBs first, so the dashboard and widget ship with Korean as the default locale
(English included).
