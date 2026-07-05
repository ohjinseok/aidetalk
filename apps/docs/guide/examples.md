# 예제 에이전트

[Agent Protocol](/guide/agent-protocol)을 처음부터 직접 구현하지 않아도 됩니다. 저장소에는
바로 실행 가능한 최소 예제 에이전트가 두 언어로 준비되어 있습니다. 두 예제 모두 동일하게
동작합니다 — 샘플 쇼핑몰 FAQ를 시스템 프롬프트로 써서 Claude API로 답하고, FAQ로 답할 수
없거나 환불/클레임처럼 사람이 처리해야 하는 요청은 상담원에게 자동으로 넘깁니다(handoff).
사람 상담원이 응대 중일 때는 답변 초안을 제안(assist)하는 것까지 포함되어 있습니다.

## Claude Code로 5분 만에 내 사이트에 맞게 고치기

두 예제 저장소 모두 README 첫 줄이 이렇게 되어 있습니다.

> **"이 레포를 Claude Code에 열고 '우리 쇼핑몰 정책에 맞게 고쳐줘'라고 하세요."**

예제 자체가 온보딩 진입점입니다. `faq.md`를 여러분의 실제 배송/교환/반품/결제 정책으로
바꾸고, Claude Code(또는 다른 코딩 에이전트)에게 자연어로 톤앤매너나 handoff 기준을
조정해 달라고 요청하면 됩니다.

## examples/agent-node (Node / Hono)

Hono + Claude API로 만든 최소 구현(약 200줄)입니다.

```bash
cd examples/agent-node
npm install
cp .env.example .env
# .env를 열어 ANTHROPIC_API_KEY, AIDETALK_AGENT_SECRET을 채워주세요.
npm start   # 또는: npx tsx index.ts
```

기본적으로 `http://localhost:8787`에서 대기합니다(`PORT` 환경변수로 변경 가능).

## examples/agent-python (Python / FastAPI)

`agent-node`와 동일한 계약을 구현하는 FastAPI 최소 예제입니다.

```bash
cd examples/agent-python
python3 -m venv venv
source venv/bin/activate  # Windows는 venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# .env를 열어 ANTHROPIC_API_KEY, AIDETALK_AGENT_SECRET을 채워주세요.
export $(grep -v '^#' .env | xargs)
python3 main.py
```

기본적으로 `http://localhost:8787`에서 대기합니다(`PORT` 환경변수로 변경 가능).

## AideTalk와 연결하기

두 예제 모두 연결 방법은 동일합니다.

1. AideTalk 대시보드 > 워크스페이스 설정 > Agent 커넥터에서 새 Agent를 등록합니다.
2. Endpoint URL에 이 예제 서버의 공개 주소를 입력합니다. 로컬에서 돌린다면
   ngrok/cloudflared 같은 터널로 임시 공개 URL을 만들 수 있습니다.
3. 발급된 Agent shared secret을 `.env`의 `AIDETALK_AGENT_SECRET`에 붙여넣습니다.
4. "연결 테스트" 버튼을 눌러 `__aidetalk_ping__` 요청에 200 응답이 오는지 확인합니다.

## 참고

- 두 예제 모두 `examples/` 하위이므로 LLM 호출 코드가 포함되어 있습니다. AideTalk 코어
  (서버/대시보드/위젯)는 이 예제들을 참조하거나 의존하지 않습니다 — 순수히 여러분이
  참고해서 복사/수정하도록 만들어진 참고 구현입니다.
- API 키 같은 시크릿은 각 예제의 `.env`에만 두고 커밋하지 마세요.
- 계약 전체 명세는 [Agent Protocol](/guide/agent-protocol) 문서를 참고하세요.
