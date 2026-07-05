---
layout: home

hero:
  name: "AideTalk"
  text: "에이드톡"
  tagline: "내 AI Agent를 5분 만에 내 사이트 채팅에 연결하세요."
  actions:
    - theme: brand
      text: 설치 가이드
      link: /guide/install
    - theme: alt
      text: Agent Protocol
      link: /guide/agent-protocol
    - theme: alt
      text: GitHub
      link: https://github.com/aidetalk/aidetalk

features:
  - icon: 🤖
    title: 내 AI Agent를 그대로
    details: LLM 호출과 로직은 여러분의 서버가 처리합니다. AideTalk는 HTTP 커넥터로 요청을 릴레이만 합니다 — 어떤 언어, 어떤 모델이든 상관없습니다.
  - icon: 💬
    title: 오픈소스 CS 메신저
    details: 위젯 + 상담 인박스 + 핸드오프까지, 셀프호스팅으로 무료 사용 가능한 AGPL-3.0 오픈소스입니다.
  - icon: 📈
    title: 상담 기여 매출(추정)
    details: 상담에서 나간 링크의 클릭과 이후 구매를 연결해, 상담이 매출에 기여한 정도를 추정해 보여줍니다.
  - icon: 🎯
    title: 실시간 상담 어시스트
    details: 사람 상담원이 응대하는 동안 AI가 답변 초안과 다음 행동을 제안합니다. 제안은 상담원에게만 보이고 손님에게는 절대 전송되지 않습니다.
---

## AideTalk란?

**AideTalk(에이드톡)**는 한국 SMB를 위한 오픈소스 CS(고객상담) 메신저입니다.
채널톡 같은 상용 상담 위젯의 오픈소스 대안이면서, 가장 큰 차별점은 이것입니다 —

> **유저가 직접 만든 AI Agent를 HTTP 커넥터 하나로 사이트 채팅에 연결한다.**

AideTalk 자체는 LLM을 호출하지 않습니다. 여러분의 AI Agent가 이미 어딘가에서 돌고 있다면
(Claude API, 사내 RAG 서버, n8n 워크플로 등 무엇이든), 계약을 지키는 HTTP 엔드포인트 하나만
등록하면 5분 안에 사이트 방문자와 대화를 시작할 수 있습니다. 자세한 계약은
[Agent Protocol](/guide/agent-protocol) 문서를 참고하세요.

## 아키텍처 한 장 요약

```
[방문자 브라우저]                          [상담원 브라우저]
  임베드 위젯(≤50KB, Preact)                 상담 인박스(대시보드)
     │ WebSocket + HTTP                        │ WebSocket + HTTP
     ▼                                         ▼
┌───────────────────────────────────────────────────────────┐
│  AideTalk 서버 — 단일 Node 프로세스 (Hono + WebSocket)       │
│                                                            │
│   REST API        WS 게이트웨이        Agent Dispatcher     │
│   (세션/대화/메시지) (실시간 전파)        (HMAC 서명 릴레이)     │
└──────┬───────────────┬─────────────────────┬────────────────┘
       ▼               ▼                     ▼  POST(HMAC, 30초 타임아웃)
   PostgreSQL        Redis              [여러분의 AI Agent 서버]
   (대화/메시지/      (pub/sub·presence)   (여러분의 인프라, 여러분의 LLM key)
    트래킹 원본)
```

- **셀프호스팅과 클라우드는 같은 Docker 이미지**입니다. 차이는 환경변수뿐입니다.
- 위젯은 React 없이 Preact로 만들어 번들이 아주 작습니다(본체 50KB gzip 이하).
- 실시간 전파는 Redis 기반이 기본이며, 단일 프로세스로만 운영한다면 in-memory 모드도 지원합니다.

## 다음 단계

- 처음 설치한다면 → [셀프호스팅 설치 가이드](/guide/install)
- 내 AI Agent를 연결하고 싶다면 → [Agent Protocol](/guide/agent-protocol)
- 사이트에 위젯을 넣는 방법이 궁금하다면 → [위젯 임베드 가이드](/guide/widget-embed)
- 바로 돌려볼 예제가 필요하다면 → [예제 에이전트](/guide/examples)
