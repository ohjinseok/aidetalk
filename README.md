# AideTalk — 개발 문서 세트 v1.0

> **한국 SMB를 위한 오픈소스 CS 메신저 + AI Agent BYO 플랫폼.**
> 채널톡의 오픈소스 대안이자, "내가 만든 AI Agent를 5분 만에 내 사이트 채팅에 연결"하는 제품.
>
> 이 문서 세트는 **구현 담당 AI(Claude Code 등)가 추가 판단 없이 코드를 작성할 수 있는 수준의 상세도**를 목표로 작성되었다.
> 모호한 부분이 나오면 코드를 짓지 말고 TODO로 남기고 질문할 것.

## 비즈니스 한 줄 요약 (돈 버는 구조)

**Open Core 모델.** 코어(위젯+인박스+커넥터)는 AGPL-3.0 오픈소스로 무료 셀프호스팅 → GitHub/커뮤니티로 유입 → 운영이 귀찮아진 팀이 **유료 클라우드(SaaS)로 전환**하는 것이 주 수익. LLM 비용은 유저가 부담(BYO Key)하므로 우리 원가는 서버비뿐 → 고마진. 상세는 `docs/01_BUSINESS_MODEL.md`.

## 브랜드 & 네이밍 규칙 (확정)

제품명은 **AideTalk**로 확정. aide(곁에서 돕는 사람) + talk. 모든 코드/문서/UI에서 아래 표기를 따른다. 다른 변형(Aidetalk, AideTalk.io, 에이드톡 단독 영문 표기 등)을 새로 만들지 말 것.

| 용도 | 표기 | 비고 |
|---|---|---|
| 제품명(문장 내, UI, 마케팅) | `AideTalk` | 카멜케이스 고정. 한국어 표기는 "에이드톡" |
| GitHub org / repo | `aidetalk` / `aidetalk/aidetalk` | 전부 소문자 |
| npm 스코프 | `@aidetalk/*` | 예: `@aidetalk/widget`, `@aidetalk/shared` |
| 도메인 1순위 | `aidetalk.io` (제품), `aidetalk.chat` (위젯 CDN/문서 후보) | **TODO(action): 가용 여부 확인 후 즉시 등록** |
| 오타 방어 도메인 | `aidtalk.io` | aide/aid 동음 오타 → 리다이렉트 |
| JS 전역 (위젯 설치 스니펫) | `window.AideTalk` | 06 §1 |
| Agent secret prefix | `adt_` | 08 §1 |
| 트래킹 URL 파라미터 | `at_l` | 02 §트래킹, 04 `/t/*` |
| 환경변수 prefix | 없음(범용 이름 사용) | 10 §환경변수 표 기준 |
| DB/Docker 기본 이름 | `aidetalk` | 10 docker compose |

> **TODO(action)** — 코드 착수 전 창업자가 직접: ① `aidetalk` GitHub org·npm 스코프 선점, ② 도메인 등록(오타 도메인 포함), ③ 키프리스에서 "에이드톡/AideTalk" 상표 출원 여부 확인 후 출원.

## 문서 구성 & 읽는 순서

| # | 파일 | 역할 | 누가 언제 읽나 |
|---|---|---|---|
| - | `CLAUDE.md` | Claude Code 작업 규칙 (레포 루트 배치) | 매 세션 자동 로드 |
| 00 | `docs/00_PRD.md` | 제품 요구사항 — 무엇을 왜 | 기능 추가/변경 판단 시 |
| 01 | `docs/01_BUSINESS_MODEL.md` | 과금 모델 + plan 제한의 **코드 명세** | 결제/plan 관련 작업 시 |
| 02 | `docs/02_ARCHITECTURE.md` | 시스템 설계 — 어떻게 | 구조 결정 시 |
| 03 | `docs/03_DATA_MODEL.md` | DB 스키마 (**Drizzle 코드 포함**) | 스키마 작업 시 |
| 04 | `docs/04_API_SPEC.md` | REST + WebSocket **전체 API 명세** | 서버/클라이언트 구현 시 상시 |
| 05 | `docs/05_AGENT_PROTOCOL.md` | AideTalk ↔ 유저 Agent HTTP 계약 (외부 공개용) | 커넥터 구현 시 |
| 06 | `docs/06_WIDGET_SPEC.md` | 위젯 구현 명세 (상태머신, UI, 재연결) | 위젯 작업 시 |
| 07 | `docs/07_DASHBOARD_SPEC.md` | 대시보드 화면·라우트·컴포넌트 명세 | 대시보드 작업 시 |
| 08 | `docs/08_SECURITY.md` | 보안 요구사항 체크리스트 | 인증/커넥터/배포 작업 시 |
| 09 | `docs/09_TESTING.md` | 테스트 전략 + 필수 테스트 케이스 목록 | 모든 기능 작업 시 |
| 10 | `docs/10_DEPLOYMENT.md` | Docker/환경변수/셀프호스팅·클라우드 배포 | M2/M3 작업 시 |
| 11 | `docs/11_ROADMAP.md` | 마일스톤 작업 분해 (수용 기준 포함) | 매 세션 작업 선정 |

**단일 출처(source of truth) 규칙:**
- API 계약 → `packages/shared`의 zod 스키마가 최종. 문서(04, 05)와 어긋나면 코드를 따르되 같은 커밋에서 문서 갱신.
- DB → `packages/db/src/schema/`가 최종. 03 문서 동일 규칙.
- 우선순위 충돌 시: CLAUDE.md 절대 규칙 > PRD Non-goals > 각 명세 문서.

## Claude Code로 개발 시작하는 법

```bash
mkdir aidetalk && cd aidetalk
# CLAUDE.md는 레포 루트에, docs/*.md는 docs/에 배치
claude
# 첫 프롬프트:
# "docs/11_ROADMAP.md의 M0에서 '모노레포 스캐폴드' 항목을 진행해줘.
#  CLAUDE.md의 스택과 레포 구조를 따르고, 구현 전 계획을 먼저 보여줘."
```

### 운영 원칙 (1인 + AI 개발)
1. **세션 = ROADMAP 체크박스 1~2개.** 더 큰 단위로 시키면 품질이 떨어진다. 완료 시 체크박스에 날짜 기입.
2. **계획 먼저.** 큰 작업은 "구현하지 말고 계획만"으로 시작 → 검토 → 진행.
3. **문서가 어긋나면 같은 커밋에서 문서를 고친다.** 문서가 썩으면 AI의 판단도 썩는다.
4. **테스트 강제 영역**(메시징 신뢰성, 권한 격리, plan 제한)은 테스트 없는 PR 금지 — 09 문서 참조.
5. **위젯 주간은 실기기 테스트 병행.** iOS Safari는 코드 리뷰로 못 잡는다.

## 시작 전 결정할 것 (Open Questions)
- [ ] 제품명 확정 (→ 전 문서에서 AideTalk 일괄 치환) + 도메인/GitHub org
- [ ] 라이선스 최종 확정 (본 문서 세트는 **AGPL-3.0 코어 + `ee/` 디렉토리 상용 라이선스**를 기본안으로 작성 — 01 문서 §5)
- [ ] 클라우드 인프라 벤더
- [ ] 텔레메트리 opt-in 항목 확정
- [ ] M0 인터뷰 대상 5명
