# examples/agent-node — 예제 Agent 커넥터 (Node / Hono)

AideTalk의 `05_AGENT_PROTOCOL.md` 계약을 구현하는 최소 예제 에이전트.
Claude API를 호출해 FAQ 응답 + handoff + assist 동작을 보여준다.

## 상태

M0 단계 — 아직 빈 상태(placeholder README만). 실제 구현은 M1 W5에서 진행한다:

- FAQ reply + handoff + assist 동작
- README 첫 줄에 Claude Code 안내 문구
- `__aidetalk_ping__` 헬스체크 처리

## 주의

- 이 예제는 `examples/` 하위이므로 LLM 호출 코드가 허용된다 (CLAUDE.md 절대 규칙 1의 예외).
- 코어(`apps/`, `packages/`)는 이 예제를 import하지 않는다.
