# Contributing to AideTalk

AideTalk에 관심을 가져주셔서 감사합니다. 이 문서는 코드/문서 기여 방법을 설명합니다.
프로젝트 배경과 절대 규칙은 [`CLAUDE.md`](./CLAUDE.md)를, 요구사항은 [`docs/internal/00_PRD.md`](./docs/internal/00_PRD.md)를
먼저 읽어보시길 권합니다 — AI 페어 개발자뿐 아니라 사람 기여자에게도 같은 규칙이 적용됩니다.

> Read this in English: this file is Korean-first. A short English summary is at the bottom
> ([English Summary](#english-summary)).

## 시작하기 전에

- 크지 않은 변경(오타, 문서, 작은 버그 수정)은 바로 PR을 보내도 됩니다.
- 새 기능이나 설계에 영향을 주는 변경은 먼저 Issue 또는 Discussion으로 제안해 주세요.
  특히 `ee/` 관련 변경, DB 스키마 변경, API 계약 변경은 논의 없이 큰 PR을 만들면
  리뷰가 늦어질 수 있습니다.
- **PRD Non-goals**에 해당하는 기능(카카오/네이버 채널 연동, 마케팅 발송, 전화 기능)은
  PRD 변경 없이는 받지 않습니다. Issue 템플릿에도 안내되어 있습니다.

## 개발 환경 셋업

### 요구사항
- Node.js **22.x** (권장: [nvm](https://github.com/nvm-sh/nvm) 또는 [volta](https://volta.sh/) 사용)
- [pnpm](https://pnpm.io/) (레포에 pinned 버전 사용 — `corepack enable` 후 자동 적용)
- Docker / Docker Compose (PostgreSQL, Redis 로컬 구동용)

### 설치 및 실행

```bash
git clone https://github.com/aidetalk/aidetalk.git
cd aidetalk
corepack enable
pnpm install

# DB/캐시 등 인프라 구동
docker compose -f docker/compose.yml up -d postgres redis

# 환경변수 준비
cp .env.example .env   # 값 채우기

# 마이그레이션
pnpm db:migrate

# 개발 서버 (server:4000, dashboard:3000, widget:5173)
pnpm dev
```

### 자주 쓰는 명령어

```bash
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit (전 워크스페이스)
pnpm test          # Vitest (unit/integration)
pnpm test:e2e      # Playwright (위젯 E2E)
pnpm db:generate   # 스키마 변경 후 마이그레이션 생성
pnpm db:migrate    # 마이그레이션 적용
```

PR을 올리기 전 최소 `pnpm lint && pnpm typecheck && pnpm test`가 로컬에서 통과해야 합니다.
CI(`ci` 워크플로)에서도 동일하게 검사하며, 실패 시 머지할 수 없습니다.

## 브랜치 & PR 규칙

자세한 배경은 [`docs/12_GIT_STRATEGY.md`](./docs/12_GIT_STRATEGY.md)를 참고하세요. 요약:

- `main`은 항상 배포 가능한 상태를 유지합니다. 직접 push하지 않습니다(보호됨).
- 짧게 사는 feature 브랜치를 사용합니다: `feat/짧은-설명`, `fix/짧은-설명`,
  `docs/짧은-설명`, `chore/짧은-설명`.
- PR은 **squash merge**로 병합됩니다. 브랜치 안 커밋 개수/메시지 품질에 크게
  신경 쓰지 않아도 되지만, PR 제목은 Conventional Commit 형식을 따라주세요
  (squash 시 그대로 커밋 메시지가 됩니다).
- 하나의 PR은 하나의 논리적 변경만 담습니다. 관련 없는 리팩터링을 같은 PR에
  섞지 마세요.
- 리뷰어가 남긴 코멘트는 새 커밋으로 반영하고(강제 push로 히스토리를 뭉개지
  말 것), 머지 직전에만 필요 시 정리합니다.

## 커밋 메시지 — Conventional Commits

```
<type>(<scope>?): <설명>

[본문 — 한국어 허용, "무엇을"보다 "왜"를 설명]

[footer — BREAKING CHANGE, 이슈 참조 등]
```

`type`은 다음 중 하나를 사용합니다: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
`test`, `build`, `ci`, `chore`, `revert`. 상세 표는 `docs/12_GIT_STRATEGY.md` §2 참고.

예:
```
feat(widget): 재연결 시 지수 백오프 적용

WS 연결이 끊긴 뒤 즉시 재시도하면 서버 부하가 튀는 문제가 있어
06_WIDGET_SPEC §4.2에 명시된 백오프 정책을 구현했다.
```

## DCO — Developer Certificate of Origin (필수)

AideTalk는 CLA(기여자 라이선스 동의서) 대신 **DCO**를 채택합니다. 별도 서명 절차 없이
커밋에 sign-off만 추가하면 됩니다. 이는 "이 커밋을 내가 작성했거나 기여할 권리가 있으며,
프로젝트 라이선스(AGPL-3.0, `ee/`는 EE License) 하에 제출하는 데 동의한다"는 확인입니다.

모든 커밋에 `-s` 플래그로 sign-off를 추가하세요:

```bash
git commit -s -m "fix: 방문자 토큰 만료 검증 버그 수정"
```

커밋 메시지 마지막에 다음 줄이 자동으로 추가됩니다:

```
Signed-off-by: Your Name <your.email@example.com>
```

sign-off가 없는 커밋이 포함된 PR은 CI에서 실패합니다. 이미 올린 PR에 sign-off를
누락했다면:

```bash
git rebase --exec 'git commit --amend --no-edit -s' main
git push --force-with-lease
```

**왜 CLA 대신 DCO인가**: 1인 창업자 프로젝트에서 CLA 서명·보관·법인 관리 비용을 감당하기
어렵고, DCO는 Linux 커널·Docker 등에서 검증된 가벼운 대안입니다. 근거와 향후 재검토
조건은 `docs/12_GIT_STRATEGY.md` §6 참고.

## 테스트 필수 영역

[`docs/09_TESTING.md`](./docs/09_TESTING.md)에 정의된 아래 영역은 **테스트 없는 PR을
merge하지 않습니다**:

1. **메시징 신뢰성** — 메시지 순서, 재연결, 중복 제거 (09 §2)
2. **Agent Dispatcher** — HMAC 검증, 타임아웃, 실패 처리 (09 §3)
3. **권한 격리** — visitor/member/workspace 경계, assist 격리 (09 §4, `CLAUDE.md` 절대 규칙 9)
4. **전환 트래킹** — 링크 태깅/클릭 집계, S1/S2 격리 (09 §5)
5. **Plan 제한(ee)** — 대화 수/시트 한도 (09 §6)

위 영역을 건드리는 PR은 테스트 코드 없이는 "구현 완료"로 보지 않습니다. PR 템플릿의
체크리스트로 해당 여부를 표시해 주세요.

## 문서-코드 동기화 규칙

README의 단일 출처(source of truth) 규칙을 그대로 따릅니다:

- **API 계약**의 최종 출처는 `packages/shared`의 zod 스키마입니다. 코드와
  `docs/04_API_SPEC.md` / `docs/05_AGENT_PROTOCOL.md`가 어긋나면 코드를 신뢰하되,
  **같은 PR/커밋에서 문서를 갱신**하세요.
- **DB 스키마**의 최종 출처는 `packages/db/src/schema/`입니다. `docs/03_DATA_MODEL.md`도
  같은 방식으로 동기화합니다.
- 스키마를 바꾸는 PR은 `pnpm db:generate`로 생성한 마이그레이션을 **같은 커밋**에
  포함해야 합니다(`CLAUDE.md` 절대 규칙 6).
- 문서가 코드와 어긋난 채로 방치되면 이후 작업(사람이든 AI든)의 판단 근거가 썩습니다.
  "나중에 문서화"는 이 프로젝트에서 허용되지 않습니다.

## 코딩 컨벤션 요약

전체 규칙은 `CLAUDE.md`에 있습니다. 자주 걸리는 부분만 요약:

- 사용자 노출 문자열은 전부 i18n 키(`packages/i18n/`). 하드코딩 금지.
- 에러는 `AppError(code, httpStatus, message)`로 통일, code는 `docs/04_API_SPEC.md` §7
  표에 있는 값만 사용.
- DB 접근은 `packages/db/src/repos/`의 repository 함수로만. 라우트 핸들러에서
  직접 쿼리하지 않습니다.
- 모든 repo 함수는 `workspaceId`를 첫 번째 필수 인자로 받습니다(멀티테넌트 격리).
- 위젯에는 React를 쓰지 않습니다(Preact까지만), 번들 예산은 50KB gzipped입니다.
  의존성 추가 전 크기 영향을 PR 설명에 적어주세요.
- `ee/` 밖 코드는 `ee/`를 import하지 않습니다. 연결 지점은 `PlanEnforcer`,
  `BillingProvider` 같은 인터페이스 주입만 허용됩니다.

## ee/ 디렉토리 기여에 대하여

`ee/`는 상용 라이선스가 적용되는 클라우드 전용 코드입니다. 외부 기여는 **코어에
한해** 환영하며, `ee/` 자체의 기능 추가/변경은 메인테이너가 직접 진행합니다. 배경은
`docs/12_GIT_STRATEGY.md` §6을 참고하세요.

## 행동 강령

이 프로젝트의 모든 참여자는 [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)를 따라야 합니다.

## 질문이 있다면

버그나 기능 제안이 아닌 일반 질문은 Issue 대신 **GitHub Discussions**를 이용해 주세요.

---

## English Summary

AideTalk is an open-source (AGPL-3.0 core + commercially-licensed `ee/`) CS messenger
project, maintained by a solo founder pairing with AI. To contribute:

1. Requires Node 22 + pnpm (`corepack enable && pnpm install`). Run `pnpm dev` to start
   server/dashboard/widget locally; see the Korean section above for exact commands.
2. Use short-lived branches (`feat/…`, `fix/…`), PRs are squash-merged, PR titles should
   follow Conventional Commits.
3. **DCO sign-off is required** on every commit (`git commit -s`) — we use DCO instead of
   a CLA to keep contribution friction low.
4. Tests are mandatory for changes touching: messaging reliability, the Agent Dispatcher
   (HMAC/timeout), permission isolation (visitor/member/workspace, assist suggestions),
   conversion tracking, and plan limits — see `docs/09_TESTING.md`.
5. `packages/shared` zod schemas and `packages/db/src/schema` are the source of truth for
   the API contract and DB schema respectively; update `docs/03`/`04`/`05` in the same
   commit if they diverge.
6. `ee/` (commercially licensed, cloud-only code) accepts internal maintainer changes only;
   external contributions should target the AGPL-licensed core.

For full details, please read the Korean sections above (or ask a translator/LLM) —
they are the canonical version of this document.
