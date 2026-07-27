# AideTalk

**내가 만든 AI Agent를 그대로 고객 채팅에 연결하는 오픈소스 CS 메신저입니다.**<br>
채팅 위젯, 상담 인박스, 사람에게 넘기는 핸드오프까지 들어 있습니다. 직접 설치해서 쓰면 무료입니다.

[![CI](https://github.com/ohjinseok/aidetalk/actions/workflows/ci.yml/badge.svg)](https://github.com/ohjinseok/aidetalk/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/core-AGPL--3.0-blue.svg)](./LICENSE)
[![ee License](https://img.shields.io/badge/ee-commercial-lightgrey.svg)](./ee/LICENSE)

```bash
git clone https://github.com/ohjinseok/aidetalk.git
cd aidetalk/docker && cp .env.example .env
docker compose up -d
```

---

## AI 응답은 내 Agent가 만듭니다

AideTalk는 AI를 직접 부르지 않습니다. 답변은 미리 만들어 둔 Agent 서버가 만들고,
AideTalk는 그 Agent를 채팅 위젯과 상담 인박스에 이어주는 일만 합니다.

그래서 API 키를 남에게 맡기지 않아도 됩니다. 어떤 모델을 쓸지, 프롬프트를 어떻게 짤지도 직접
정합니다. AI가 답한 만큼 나가는 돈은 쓰고 있는 API 요금뿐입니다.

|  | AideTalk | 보통의 CS 메신저 무료 플랜 |
|---|---|---|
| 지난 상담 | 제한 없이 보관 | 대개 최근 30일까지 |
| AI 상담 | 내 Agent 연결, API 요금만 | 상위 요금제 + 상담 건당 추가 요금 |
| 대화 내용 | 내 서버에 보관 | 서비스 회사 서버에 보관 |
| 상담원 | 인원 제한 없음 | 인원이 늘면 요금도 늘어남 |

## 화면

**상담 인박스** — AI가 답한 메시지에는 `AI` 표시가 붙습니다. 사람이 이어받으면 말풍선 모양이
달라져서, 지금 누가 답하고 있는지 목록만 봐도 알 수 있습니다.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/inbox-dark.png">
  <img alt="AideTalk 상담 인박스 — AI 자동응답과 상담원 핸드오프" src="docs/assets/inbox-light.png">
</picture>

**채팅 위젯** — 붙인 사이트의 CSS와 서로 간섭하지 않습니다. 압축해서 32KB입니다.

<img alt="AideTalk 채팅 위젯" src="docs/assets/widget.png" width="380">

## 담긴 기능

- **채팅 위젯** — 카페24나 아임웹으로 만든 쇼핑몰에 붙이는 것을 기준으로 만들었습니다.
- **Agent 커넥터** — 정해진 형식으로 요청을 주고받기만 하면 어떤 언어로 만든 Agent든
  연결됩니다. Claude API로 동작하는 예제가 Node와 Python 두 벌 들어 있습니다.
- **핸드오프와 상담 인박스** — AI가 막히거나 손님이 사람을 찾으면 바로 상담원에게 넘어갑니다.
  대화 목록과 검색, 실시간 알림이 있는 관리 화면이 함께 옵니다.
- **상담 어시스트** — 상담원이 답을 쓰는 동안 AI가 초안을 옆에 띄워줍니다. 이 초안은 상담원만
  볼 수 있고 손님에게는 나가지 않습니다.
- **상담 기여 매출(추정)** — 상담을 거친 손님이 실제로 구매했는지 링크와 전환으로 따라갑니다.
  상담이 매출을 만들었다고 단정하는 값이 아니라, 얼마나 거들었는지 가늠하는 값입니다.
- **직접 설치하든 클라우드를 쓰든 같은 이미지** — 환경변수 하나만 다릅니다.

## 설치

Docker와 Docker Compose v2만 있으면 됩니다.

```bash
git clone https://github.com/ohjinseok/aidetalk.git
cd aidetalk/docker && cp .env.example .env
```

`.env`에서 비밀값 세 개만 채웁니다. 값은 `openssl rand -hex 32`로 만들면 됩니다.

```bash
DB_PASSWORD=...
VISITOR_TOKEN_SECRET=...
SESSION_SECRET=...
```

```bash
docker compose up -d
curl http://localhost/healthz     # {"ok":true}
```

`http://localhost`에 들어가 가입하면 그 계정이 관리자가 되고, 그때부터 아무나 가입하는 길은
자동으로 닫힙니다. 팀원은 초대로 들어옵니다. 워크스페이스를 만든 뒤 위젯 설정 화면에서 코드를
복사해 사이트에 붙여넣으면 첫 문의를 받을 준비가 끝납니다.

### 도메인 붙이기

`.env`에 주소 한 줄만 적으면 인증서를 알아서 받아옵니다. 도메인이 서버를 가리키고 있고
80·443 포트가 열려 있으면 됩니다.

```bash
PUBLIC_URL=https://cs.example.com
```

이미 Traefik이나 Nginx Proxy Manager를 쓰고 있다면 같이 들어 있는 Caddy를 빼고 연결해도
됩니다. 어떤 주소를 어디로 넘겨야 하는지는 [배포 문서](./docs/10_DEPLOYMENT.md)에 표로
정리해 두었습니다.

## 내 Agent 연결하기

이미 Agent가 있다면 [Agent Protocol](./docs/05_AGENT_PROTOCOL.md)에 적힌 형식대로 요청을
받고 답만 하면 됩니다. 없다면 바로 돌려볼 수 있는 예제가 두 벌 있습니다. 둘 다 Claude API로
자주 묻는 질문에 답하고, 답하기 어려운 것은 사람에게 넘깁니다.

```bash
cd examples/agent-node        # 또는 examples/agent-python
```

관리 화면의 Agent 커넥터에서 새 Agent를 등록하고 주소를 넣으면 비밀값이 나옵니다. 그 값을
예제의 `.env`에 옮겨 적고 연결 테스트를 누르면 끝입니다.

> 기본 설정은 HTTPS로 열려 있는 주소만 받습니다. 같은 서버나 사내망에 띄운 Agent에 붙이려면
> `ALLOW_INSECURE_AGENT_ENDPOINT=true`가 필요한데, 이것을 켜면 무엇을 감수하게 되는지
> [배포 문서](./docs/10_DEPLOYMENT.md)에 적어 두었습니다.

## 문서

만든 방식을 적은 문서는 `docs/` 아래에 전부 열려 있습니다.

- [아키텍처](./docs/02_ARCHITECTURE.md) · [데이터 모델](./docs/03_DATA_MODEL.md) · [API 명세](./docs/04_API_SPEC.md)
- [Agent Protocol](./docs/05_AGENT_PROTOCOL.md) — 밖에 공개한 연결 규격
- [위젯](./docs/06_WIDGET_SPEC.md) · [보안](./docs/08_SECURITY.md) · [배포](./docs/10_DEPLOYMENT.md)

쓰는 법을 안내하는 가이드 사이트는 `apps/docs/`에 있고 이렇게 바로 띄워볼 수 있습니다.

```bash
pnpm --filter @aidetalk/docs dev
```

## 라이선스

위젯, 상담 인박스, Agent 커넥터를 비롯해 직접 설치해서 쓰는 데 필요한 모든 것은
[AGPL-3.0](./LICENSE)이고 기능을 잠가둔 곳이 없습니다.

결제와 요금제 한도, 자동 백업처럼 클라우드 운영에만 쓰이는 코드는 `ee/` 아래에 따로 두고
[상용 라이선스](./ee/LICENSE)를 따릅니다. `ee/`가 없어도 나머지는 그대로 빌드되고 동작합니다.

## 기여

버그 제보도 기능 제안도 코드도 모두 환영합니다. 개발 환경을 맞추는 방법과 PR 올리는 방법은
[CONTRIBUTING.md](./CONTRIBUTING.md)에 있습니다. 지켜야 할 태도는
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md), 보안 문제 제보는
[SECURITY.md](./SECURITY.md)를 봐 주세요.

---

## English

**AideTalk is an open-source customer support messenger that connects *your own* AI agent to
your website's chat.** It ships the parts you would otherwise rebuild every time: an embeddable
widget, a shared agent inbox, AI-to-human handoff, and per-workspace isolation.

The core idea is that we never call an LLM. Your agent server does, over a signed HTTP contract,
so your API keys stay yours and AI replies cost you provider rates instead of per-conversation
SaaS pricing. Bring any language or runtime — Node and Python examples are included.

Self-hosting is free under AGPL-3.0 with no feature limits. A single `docker compose up -d`
brings up PostgreSQL, Redis, the server, the dashboard, and Caddy; point `PUBLIC_URL` at your
domain and you get HTTPS automatically. Documentation lives in [`docs/`](./docs) — start with
[the architecture overview](./docs/02_ARCHITECTURE.md) and
[the agent protocol](./docs/05_AGENT_PROTOCOL.md).

Built for Korean small businesses first, so Korean is the default locale (English included).
