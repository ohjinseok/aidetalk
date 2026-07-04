이 레포를 Claude Code에 열고 "우리 쇼핑몰 정책에 맞게 고쳐줘"라고 하세요.

# examples/agent-node — 예제 Agent 커넥터 (Node / Hono)

AideTalk의 `docs/05_AGENT_PROTOCOL.md` 계약을 구현하는 최소 예제 에이전트입니다.
`faq.md`에 있는 샘플 쇼핑몰 FAQ를 시스템 프롬프트로 사용해 Claude API로 응답을 생성하고,
FAQ로 답할 수 없거나 환불/클레임 등 사람이 처리해야 하는 요청은 상담원에게 자동으로
넘깁니다(handoff).

## 동작 요약

- `mode=reply`: 손님 메시지에 FAQ 기반으로 답하거나(`reply`), 모르면 상담원 연결(`handoff`)
- `mode=assist`: 사람 상담원이 응대 중일 때 답변 초안을 제안(`suggest`) — 이 제안은
  상담원에게만 보이고 손님에게는 절대 전송되지 않습니다.
- `message.text === "__aidetalk_ping__"`: LLM 호출 없이 고정 응답 (대시보드
  "연결 테스트" 버튼용)
- 모든 요청은 `X-AideTalk-Signature` HMAC 서명을 검증한 뒤에만 처리합니다.

## 설치

이 예제는 독립 패키지입니다 (모노레포 pnpm workspace에 포함되지 않습니다). 이 디렉토리에서:

```bash
cd examples/agent-node
npm install
cp .env.example .env
# .env를 열어 ANTHROPIC_API_KEY, AIDETALK_AGENT_SECRET을 채워주세요.
```

## 실행

```bash
npm start        # 또는: npx tsx index.ts
npm run dev       # 파일 변경 시 자동 재시작
```

기본적으로 `http://localhost:8787` 에서 대기합니다 (`PORT` 환경변수로 변경 가능).

## AideTalk와 연결하기

1. AideTalk 대시보드 > 워크스페이스 설정 > Agent 커넥터에서 새 Agent를 등록합니다.
2. Endpoint URL에 이 서버의 공개 주소(예: ngrok/cloudflared 터널 또는 배포 URL)를 입력합니다.
3. 발급된 Agent shared secret을 `.env`의 `AIDETALK_AGENT_SECRET`에 붙여넣습니다.
4. "연결 테스트" 버튼을 눌러 `__aidetalk_ping__` 요청에 200 응답이 오는지 확인합니다.

## 커스터마이징

- `faq.md`: 실제 쇼핑몰의 배송/교환/반품/결제 정책으로 교체하세요.
- `index.ts`의 `REPLY_SYSTEM_PROMPT` / `ASSIST_SYSTEM_PROMPT`: 톤앤매너와 handoff
  기준을 조정하세요.
- Claude Code에서 이 디렉토리를 열고 "환불 정책을 이렇게 바꿔줘" 같은 자연어로
  요청하면 바로 반영됩니다.

## 참고

- API 계약 전체: `../../docs/05_AGENT_PROTOCOL.md`
- 이 예제는 `examples/` 하위이므로 LLM 호출 코드가 허용됩니다
  (CLAUDE.md 절대 규칙 1의 예외). 코어(`apps/`, `packages/`)는 이 예제를 import하지 않습니다.
- API 키 등 시크릿은 `.env`에만 두고 커밋하지 마세요 (`.env`는 루트 `.gitignore`에 포함됨).
