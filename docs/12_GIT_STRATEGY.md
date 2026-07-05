# 12_GIT_STRATEGY.md — Git/GitHub 운영 전략

> 브랜치·커밋·릴리스·저장소 설정에 대한 운영 규칙을 정의한다. 1인 창업자 + AI 페어
> 개발 체제에서 "규칙이 실행을 대신한다" — 애매하면 이 문서가 아니라 `CLAUDE.md` >
> PRD Non-goals 순으로 우선한다(그 다음이 본 문서).
> 기여자용 요약은 `CONTRIBUTING.md`, 코드 작업 규칙은 `CLAUDE.md` 참고.

## 1. 브랜치 전략 — Trunk-Based Development

- **`main`이 유일한 장수 브랜치**다. 항상 배포 가능한 상태를 유지한다(`pnpm dev`로
  기동 가능, CI 통과).
- 모든 작업은 `main`에서 분기한 **짧게 사는 feature 브랜치**에서 진행하고, PR로만
  `main`에 합류한다.
  - `feat/짧은-설명` — 새 기능
  - `fix/짧은-설명` — 버그 수정
  - `docs/짧은-설명` — 문서만
  - `chore/짧은-설명` — 빌드/설정/잡무
  - `refactor/짧은-설명` — 동작 변화 없는 구조 개선
- 브랜치 수명은 원칙적으로 **2~3일 이내**(하나의 ROADMAP 체크박스 단위,
  `docs/internal/DEV_README.md` "세션 = 체크박스 1~2개" 원칙과 동일한 크기). 오래 걸리는
  작업은 더 작은 단위로 쪼개서 여러 PR로 나눈다.
- **머지 방식은 squash merge 고정.** `main`의 커밋 히스토리는 "PR 1개 = 커밋 1개"로
  선형 유지한다. 브랜치 안에서의 커밋 개수/메시지 품질은 자유롭게 실험해도 되고,
  PR 제목이 최종 커밋 메시지가 되므로 PR 제목만 Conventional Commits 형식을 지키면
  된다.
- `main`은 **branch protection**으로 보호한다 (§4 체크리스트 참고). 직접 push,
  force-push 전부 금지.
- release 브랜치는 v1 시점에는 두지 않는다. 필요해지면(예: 핫픽스를 이전 minor에
  백포트해야 하는 상황) `release/vX.Y` 형태로 그때 도입하고 이 문서에 추가한다.

## 2. 커밋 규약 — Conventional Commits

형식:
```
<type>(<scope>?): <설명>

[본문 — 한국어 허용]

[footer]
```

| type | 의미 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `docs` | 문서 전용 변경 |
| `style` | 포맷팅 등 동작에 영향 없는 변경 (세미콜론, 공백 등) |
| `refactor` | 기능 변화 없는 코드 구조 개선 |
| `perf` | 성능 개선 |
| `test` | 테스트 추가/수정 |
| `build` | 빌드 시스템, 의존성 변경 |
| `ci` | CI 설정 변경 |
| `chore` | 그 외 잡무 (버전 태그, 잡다한 설정 등) |
| `revert` | 이전 커밋 되돌리기 |

- `scope`는 선택. 레포 구조를 따르는 것을 권장: `feat(widget): ...`,
  `fix(server): ...`, `docs(agent-protocol): ...`.
- **본문(body)은 한국어로 작성 가능** — 오히려 "왜"를 설명할 때는 한국어가 더
  명확하다면 한국어를 우선한다. `type`/`scope`/`BREAKING CHANGE:` 같은 구조적 키워드는
  영어 그대로 유지한다(툴링 호환).
- Breaking change는 footer에 `BREAKING CHANGE: <설명>`으로 표기. 향후 Changesets 도입
  시(§3) 이 표기를 semver major 판단에 활용한다.
- 커밋 하나 = 논리적 변경 하나. "그리고"로 두 가지를 설명해야 하는 커밋은 쪼갠다.
- **모든 커밋에 DCO sign-off 필수** (`git commit -s`). 근거는 §6.

## 3. 버전/릴리스

### v1 (현재): 태그 없음, 지속 배포
M0~M2 기간에는 정식 버전을 태그하지 않는다. `main`의 최신 커밋이 곧 "최신"이며,
클라우드는 여기서 지속 배포한다. 셀프호스팅 사용자는 `docker pull` 시 `latest` 또는
커밋 SHA 태그를 사용한다.

### v1.x부터: SemVer + Changesets 도입 계획
M2("공개 준비") 종료 시점부터 정식 버전을 매긴다.

- **SemVer(`MAJOR.MINOR.PATCH`)** 채택. AGPL 코어와 `ee/`는 한 저장소·한 버전 번호를
  공유한다(별도 버전 관리 안 함 — 복잡도 최소화).
  - `MAJOR`: API 계약(04/05 문서 대상) breaking change, DB 마이그레이션 되돌리기 불가능한 변경
  - `MINOR`: 하위 호환 기능 추가
  - `PATCH`: 버그 수정, 보안 패치
- **[Changesets](https://github.com/changesets/changesets) 도입** (M2 작업 항목으로
  `docs/11_ROADMAP.md`에 반영 예정 — TODO):
  - PR 작성자가 `.changeset/*.md`에 변경 요약 + bump 종류(major/minor/patch)를 기록.
  - 머지 누적 후 "Version Packages" PR을 자동/수동 생성해 `CHANGELOG.md` + 버전 갱신.
  - 모노레포(pnpm workspaces) 구조와 궁합이 좋고, 패키지별(`@aidetalk/widget` 등)
    독립 버전이 필요해지면(v2+) 그대로 확장 가능.
- **GitHub Releases**: 태그 `v*`(예: `v1.2.0`) 푸시 시 Release 초안 생성. Release
  노트는 Changesets가 생성한 CHANGELOG 구간을 붙여넣는다.
- **Docker 이미지 태그 정책**:
  - `latest` — `main` 최신 (지속 배포용, 프로덕션 셀프호스팅에는 비권장)
  - `vX.Y.Z` — 해당 릴리스 고정 (프로덕션 권장)
  - `vX.Y` — 해당 minor의 최신 patch로 이동 (자동 패치 업데이트를 원하는 경우)
  - `edge` 또는 커밋 SHA — CI에서 매 머지마다 발행, 얼리어답터/디버깅용
  - 코어와 `ee/`를 포함한 동일 이미지 하나만 배포한다(`CLAUDE.md` 절대 규칙: 셀프호스팅
    = 클라우드 동일 이미지). `EDITION` 환경변수로 런타임 분기.

## 4. GitHub 저장소 설정 체크리스트

공개(M2) 이전, 또는 org/repo 생성 직후 적용할 설정. 저장소 Settings에서 수동 적용하며
(Terraform 등으로 코드화하기엔 1인 프로젝트 규모에 과함), 이 문서를 체크리스트로 사용한다.

### Branch protection (`main`)
- [ ] PR을 통해서만 병합 허용 (직접 push 금지)
- [ ] 머지 전 **필수 status check**: `ci` (lint + typecheck + vitest — 다른 작업에서
      구성)
- [ ] 머지 전 최소 1인 승인 필요 — 단, 1인 창업자 단계에서는 self-merge 허용하되
      **CI 통과는 예외 없이 필수**로 둔다. 공동 메인테이너 합류 시 승인 요건 강화
- [ ] `main`에 대한 force-push, 브랜치 삭제 금지
- [ ] squash merge만 허용 (merge commit, rebase merge 비활성화)
- [ ] 관리자도 규칙 예외 없이 적용 (`Include administrators`)

### 라벨 세트 (제안)
| 라벨 | 용도 |
|---|---|
| `bug` | 버그 |
| `enhancement` | 기능 제안 |
| `docs` | 문서 |
| `triage` | 신규 Issue 기본 라벨, 분류 대기 |
| `good first issue` | 신규 기여자 추천 |
| `help wanted` | 외부 기여 환영 |
| `security` | 보안 관련 (공개 전 내용 재검토 필수) |
| `ee` | `ee/` 디렉토리 관련 (외부 PR 원칙적으로 비수용, §6 참고) |
| `needs-repro` | 재현 안 됨, 추가 정보 필요 |
| `wontfix` | PRD Non-goals 등으로 인한 반려 |
| `M0` / `M1` / `M2` / `M3` | 마일스톤 라벨(마일스톤 필드와 별도로 보드 필터용) |

### 마일스톤
`docs/11_ROADMAP.md`의 M0~M3를 GitHub Milestone으로 동일하게 생성:
- [ ] `M0 — 검증 & 기반`
- [ ] `M1 — 코어 빌드`
- [ ] `M2 — 셀프호스팅 패키징 & 공개 준비`
- [ ] `M3 — 클라우드 알파 & 런칭`

마일스톤 설명에 ROADMAP.md 링크를 남겨 단일 출처를 유지한다(마일스톤 자체를 계획
문서로 쓰지 않는다 — 문서가 out of sync 되는 원인).

### Discussions
- [ ] 활성화. 카테고리: `Q&A`, `Ideas`(기능 아이디어 초기 논의), `Show and tell`
      (셀프호스팅 사례 공유 — 커뮤니티 신뢰 자산), `Announcements`(메인테이너 전용 게시)

### Dependabot
- [ ] `.github/dependabot.yml` 구성 (별도 작업으로 추가 예정 — 본 문서는 정책만 명시):
  - `package-ecosystem: npm`, 대상 `/` (pnpm workspaces 루트 — 모노레포 전체 커버)
  - 주기: weekly
  - `docker` 에코시스템도 등록 (`docker/` 하위 Dockerfile 베이스 이미지)
  - 보안 패치(semver patch)는 자동 병합 후보로 고려(M2 이후), minor/major는 수동 리뷰

### 기타
- [ ] About 섹션: 짧은 한 줄 설명 + 토픽 태그(`customer-support`, `chat-widget`,
      `open-source`, `agpl`, `korean` 등) + 홈페이지 URL(도메인 확정 후)
- [ ] Social preview 이미지 (`docs/internal/DEV_README.md` §브랜드 표 확정 후 M2에서 준비)

## 5. 오픈소스 공개 전 체크리스트 (M2 시점)

`docs/11_ROADMAP.md` M2의 "README(스크린샷/데모 GIF) + 이슈 템플릿 + CONTRIBUTING" 항목과
짝을 이루는 점검 목록.

### 5-0. 공개 방식 (확정): private 개발 레포 유지 + 공개 레포 fresh start

이 저장소(개발 레포)는 **private으로 유지**하고, 공개용 `aidetalk/aidetalk` 레포는
**정제된 스냅샷 커밋 1개("chore: initial public release")로 새로 시작**한다.

- **왜**: 개발 히스토리에는 내부 문서(`docs/internal/` — PRD의 사업 가설, 과금·마진 전략)가
  커밋되어 있다. `.gitignore`/삭제 커밋은 히스토리에 남은 과거 버전을 지우지 못하므로,
  히스토리를 물려주지 않는 fresh start가 가장 확실하고 단순하다 (n8n·Cal.com류도
  "initial release"로 시작한 공개 레포가 흔함).
- **공개 레포에서 제외**: `docs/internal/`(사업 문서), `.claude/`(있다면), 그 외 내부 전용 파일.
  나머지(코드 전체, docs 02~12, CLAUDE.md, 거버넌스 파일)는 공개 — 로드맵/아키텍처 공개는
  커뮤니티 신뢰 자산이다.
- **절차**: ① 개발 레포에서 릴리스 대상 트리 준비(제외 목록 반영) → ② 새 저장소에 단일
  커밋으로 push → ③ 이후 공개 레포가 main 개발 저장소가 되고, 이 개발 레포는 아카이브
  (내부 문서는 별도 private `aidetalk/internal` 레포나 노션으로 이관).
- **주의**: 공개 이후에는 fresh start 불가(포크·클론이 생김). 공개 전 마지막 기회라는
  전제로 아래 점검을 수행한다.

- [ ] **시크릿 스캔**: 공개 대상 트리와 (참고용) 개발 히스토리 전체에 대해
      [gitleaks](https://github.com/gitleaks/gitleaks) 또는 GitHub push protection /
      secret scanning으로 전수 스캔. 발견 시 해당 시크릿 즉시 폐기(rotate).
- [ ] **공개 대상 트리 점검**: 개인 식별 정보(실제 고객 데이터, 내부 전용 메모,
      테스트용 실제 API 키), `docs/internal/` 잔여 참조가 남아있지 않은지 확인.
- [ ] `.env`, `.env.local` 등 실제 값이 든 파일이 히스토리에 없는지 확인
      (`.env.example`만 추적되어야 함).
- [ ] **README 정비**: 스크린샷/데모 GIF, "왜 만들었나", 30분 셀프호스팅 절차,
      라이선스 배지(AGPL-3.0), 브랜드 표기 규칙 재확인.
- [ ] `LICENSE`(AGPL-3.0 전문), `ee/LICENSE`(상용 라이선스), `CONTRIBUTING.md`,
      `CODE_OF_CONDUCT.md`, `SECURITY.md`, 이슈/PR 템플릿 전부 존재 확인 (본 작업 단위로
      선반영 완료 — 이 체크리스트는 M2 시점 재확인용).
  - [x] LICENSE / ee/LICENSE / CONTRIBUTING.md / CODE_OF_CONDUCT.md / SECURITY.md /
        이슈·PR 템플릿 초안 작성 완료 (2026-07-03)
- [ ] `docs/08_SECURITY.md` 전 항목 감사(ROADMAP M2 "보안 점검" 항목과 동일 작업).
- [ ] 상표/도메인(`docs/internal/DEV_README.md` §브랜드 표 TODO) 확정 여부 재확인 — 미확정이어도 공개 자체를
      막을 필요는 없으나, 오타 도메인 등 방어 조치는 공개 전 완료 권장.
- [ ] GitHub org(`aidetalk`) 2단계 인증 활성화, 저장소 관리자 계정 보안 점검.
- [ ] 이슈/PR 템플릿, Discussions, branch protection(§4) 적용 확인.

## 6. `ee/` 디렉토리 기여 정책

- **외부 기여는 코어(AGPL 영역)만 받는다.** `ee/` 하위 변경(기능 추가, 리팩터링 포함)은
  메인테이너가 직접 수행하며, 외부에서 올라온 `ee/` 변경 PR은 원칙적으로 반려하거나
  `ee` 라벨을 붙여 별도 논의 없이는 병합하지 않는다.
  - 예외: `ee/`의 명백한 버그 수정(오탈자, 빌드 깨짐 등)은 케이스별로 검토 후 수용 가능.
  - 이유: `ee/`는 상용 라이선스 코드이자 수익 모델의 핵심(`docs/internal/01_BUSINESS_MODEL.md`)이라
    기여자 소유권/라이선스 처리가 코어보다 복잡하고, 1인 메인테이너 체제에서 리뷰
    대역폭도 한정적이다.
- 코어(AGPL) 기여는 통상적인 오픈소스 프로젝트와 동일하게 폭넓게 환영한다.
- **CLA 없이 DCO를 채택한 이유**:
  1. CLA는 법인 관리(서명 보관, 버전 관리, 서명 자동화 봇 등)가 필요해 1인 창업자
     단계에서 운영 비용이 과하다.
  2. DCO(`git commit -s`)는 Linux 커널, Docker, GitLab 등에서 검증된 경량 대안으로,
     "기여자가 기여할 권리가 있음을 커밋 단위로 확인"하는 목적은 CLA와 동일하게 달성한다.
  3. `ee/`는 CLA가 주로 방어하려는 "회사가 나중에 라이선스를 바꿀 권리" 문제와
     애초에 무관하다 — `ee/`는 외부 기여를 받지 않으므로 소유권 분쟁 소지가 원천적으로
     적고, 코어(AGPL)는 라이선스를 다시 폐쇄적으로 바꿀 계획이 없으므로 CLA로 확보해야
     할 "재라이선스 권한"의 필요성이 낮다.
  - **재검토 조건**: 코어 라이선스를 향후 변경해야 하는 상황(예: 투자 유치 조건, 사업
    구조 변경)이 생기면 그 시점에 CLA 도입을 재검토한다. 현재는 해당 사항 없음.

## 7. 참고 — 이 문서와 다른 문서의 관계

- 브랜치/커밋/DCO의 **기여자용 실행 가이드**는 `CONTRIBUTING.md`에 요약되어 있다.
  이 문서(12)는 "왜 이렇게 정했는가"와 저장소 운영자용 체크리스트를 담당하고,
  `CONTRIBUTING.md`는 "기여자가 무엇을 해야 하는가"를 담당한다. 두 문서가 어긋나면
  이 문서를 신뢰하되 같은 커밋에서 `CONTRIBUTING.md`도 갱신한다.
- 라이선스 결정의 배경(왜 AGPL+ee인가)은 `docs/internal/01_BUSINESS_MODEL.md` §5가 출처다.
  이 문서는 그 결정을 Git/GitHub 운영에 어떻게 반영하는지만 다룬다.
- CI 자체(워크플로 정의)는 별도 작업에서 `.github/workflows/ci.yml`로 구현한다. 이
  문서에서는 필수 status check 이름을 `ci`로 가정하고 참조만 한다.
