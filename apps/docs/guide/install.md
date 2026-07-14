# 셀프호스팅 설치 가이드

> 목표: 모르는 사람이 이 페이지만 보고 30분 안에 AideTalk를 띄우고 첫 대화를 성립시킨다.
> 셀프호스팅과 클라우드는 **완전히 같은 Docker 이미지**를 씁니다. 차이는 환경변수(`EDITION`)뿐입니다.

## 준비물

- Docker + Docker Compose v2 (`docker compose version`으로 확인)
- 시크릿 생성용 `openssl` (대부분의 Linux/macOS에 기본 설치되어 있습니다)
- (프로덕션이라면) 서버를 가리킬 도메인 1개 이상과 리버스 프록시 — 로컬에서만 써본다면 없어도 됩니다

## 1. 저장소 클론 & 환경변수 준비

```bash
git clone https://github.com/aidetalk/aidetalk && cd aidetalk/docker
cp .env.example .env
```

`.env`를 열어 아래 값들을 채웁니다. 시크릿은 다음 명령으로 생성하세요.

```bash
openssl rand -hex 32
```

## 2. 원커맨드 기동

```bash
docker compose up -d
```

`postgres` → `redis` → `server`(마이그레이션 자동 실행 후 기동) → `dashboard` 순서로 올라옵니다.
서버 상태는 아래로 확인할 수 있습니다.

```bash
curl http://localhost:4000/healthz
# {"ok":true}
```

## 3. 첫 워크스페이스 만들기

1. 브라우저에서 `http://localhost:3000` 접속
2. 가입 → 워크스페이스 생성 (업종 세그먼트 선택 — 사이트가 있으면 S1, 없으면 S2)
3. 위젯 설정 화면에서 임베드 코드를 복사해 여러분의 사이트에 붙여넣기
4. 워크스페이스 설정 > Agent 커넥터에서 AI Agent 엔드포인트를 등록 — 아직 없다면
   [예제 에이전트](/guide/examples)로 5분 안에 하나 띄울 수 있습니다.

여기까지가 "30분 안에 대화 성립" 기준선입니다. 실제 사이트 임베드는
[위젯 임베드 가이드](/guide/widget-embed)를 참고하세요.

## 4. 환경변수 표

`docker/.env.example`이 아래 표의 실제 예시 파일입니다. 셀프호스팅에서는 `(ee)` 표시된
항목은 필요하지 않습니다(클라우드 에디션 전용).

| 변수 | 기본값 | 필수 | 설명 |
|---|---|---|---|
| `DATABASE_URL` | - | ✅ | Postgres 연결 문자열 |
| `REDIS_URL` | - | `PUBSUB_DRIVER=redis`일 때 | |
| `PUBSUB_DRIVER` | `redis` | | `redis` \| `memory` (단일 프로세스 전용) |
| `STORAGE_DRIVER` | `local` | | `local` \| `s3` |
| `STORAGE_LOCAL_PATH` | `/data/files` | local일 때 | |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | - | s3일 때 | R2/MinIO 등 S3 호환 스토리지 |
| `SERVER_URL` | - | ✅ | 서버의 외부 공개 URL (위젯 임베드/링크 태깅 기준) |
| `DASHBOARD_URL` | - | ✅ | CORS 허용 오리진 / 초대 링크 기준 |
| `PORT` | `4000` | | 서버 리스닝 포트 |
| `VISITOR_TOKEN_SECRET` | - | ✅ | 방문자 세션 토큰 서명 키. 32바이트 이상 랜덤 |
| `SESSION_SECRET` | - | ✅ | 상담원/대시보드 세션 서명 키 |
| `SECRET_ENC_KEY` | (없음) | | Agent/웹훅 secret을 AES-256-GCM으로 암호화하는 전용 키(32바이트, hex 또는 base64). 비워두면 `SESSION_SECRET`에서 파생한 키로 폴백하고 부팅 시 경고 로그를 남깁니다. 세션 키 로테이션과 분리하려면 값을 채우는 것을 권장합니다 |
| `EDITION` | (없음) | | `cloud`면 ee(클라우드 전용) 모듈을 로드합니다. 비워두면 셀프호스팅 모드 |
| `ALLOW_INSECURE_AGENT_ENDPOINT` | `false` | | Agent/웹훅 엔드포인트의 SSRF 가드 완화 스위치. 기본값(`false`)은 `https` + 공인 IP만 허용합니다. 내부망 Agent를 쓰려면 `true` — 아래 설명 참고 |
| `ALLOW_PUBLIC_SIGNUP` | `false` | | 공개 회원가입 허용 여부. 기본값이어도 **설치 직후 첫 가입(유저 0명)**과 **초대받은 이메일의 가입**은 허용됩니다 — 즉 첫 관리자 계정을 만들고 나면 공개 가입이 자동으로 닫히고, 이후 팀원은 초대로 합류합니다. 누구나 가입 가능하게 열려면 `true` |
| `SMTP_URL` | (없음) | | 비워두면 이메일 발송이 전부 스킵되고 로그만 남습니다(셀프호스팅 기본 동작) |
| `LOG_LEVEL` | `info` | | pino 로그 레벨 |
| `TELEMETRY_ENABLED` | `false` | | **opt-in** 익명 텔레메트리. 기본은 꺼져 있으며, `true`로 명시적으로 켰을 때만 동작합니다 |
| `TELEMETRY_ENDPOINT` | placeholder 도메인 | | 텔레메트리 전송 대상 URL. 실제 수집 서버 도메인이 아직 확정 전이라 코드에 TODO로 표시되어 있습니다 |

시크릿(`VISITOR_TOKEN_SECRET`, `SESSION_SECRET`, `SECRET_ENC_KEY` 등)은 절대 코드나 로그에
남기지 마세요. 로그에는 항상 마스킹된 형태(`sk_live_ab****`)로만 남습니다.

### 내부망 Agent를 쓰려면 (`ALLOW_INSECURE_AGENT_ENDPOINT`)

AideTalk 서버는 여러분이 등록한 Agent 엔드포인트와 웹훅 URL로 **직접 요청을 보냅니다**. 그래서
기본값(`false`)에서는 엔드포인트가 `https`여야 하고, 공인 IP로 리졸브돼야 합니다. 사설/루프백 대역
(`10.x`, `172.16~31.x`, `192.168.x`, `127.x`, `::1`, `fc00::/7`)은 등록·발송 모두 거부됩니다.

이 검사가 없으면 워크스페이스 멤버가 엔드포인트를 `http://169.254.169.254/...`(클라우드 메타데이터)나
사내망 주소로 지정해 서버가 대신 요청하게 만들 수 있고, 그 응답이 상담 화면에 노출됩니다
(SSRF — AWS/GCP VM에 설치했다면 인스턴스 자격증명이 새어나갈 수 있습니다).

**같은 Docker 네트워크나 LAN에 Agent를 띄운 경우**(예: `http://my-agent:8080`,
`http://192.168.1.10:3000`, 로컬 개발의 `http://localhost:5000`)에는 `ALLOW_INSECURE_AGENT_ENDPOINT=true`가
필요합니다. 다만 켜는 순간 **서버가 워크스페이스 멤버가 지정한 내부망 주소로 요청을 보낼 수 있게 된다**는
점을 이해하고 켜세요 — 멤버가 전부 신뢰할 수 있는 내부 인원일 때만 권장합니다.

켜더라도 클라우드 메타데이터/링크로컬 대역(`169.254.0.0/16`, `fe80::/10`, `fd00:ec2::254`)은 **항상
차단**됩니다.

### 텔레메트리(opt-in) 수집 항목

기본은 꺼져 있습니다(`TELEMETRY_ENABLED=false`). 켜더라도 대화 내용·메시지·이메일 등 어떤 개인정보도
수집하지 않으며, 아래 항목이 전부입니다. 주 1회 전송하고 전송 실패는 조용히 무시합니다.

| 항목 | 설명 |
|---|---|
| 인스턴스 익명 ID | 최초 전송 시 랜덤 생성해 DB에 저장. 재설치하면 새로 생성됩니다 |
| 버전 | 서버 버전 |
| 워크스페이스 개수 | 전체 워크스페이스 "수"만 |
| 대화 개수 | 전체 대화 "수"만 (메시지 본문 없음) |
| 에이전트(커넥터) 개수 | 등록된 AI 커넥터 "수"만 (엔드포인트 URL 없음) |

## 5. 리버스 프록시 (Caddy 예시)

프로덕션에서는 TLS 종료와 도메인 라우팅을 위해 리버스 프록시가 필요합니다. AideTalk는
WebSocket(`/ws/*`)을 쓰므로 **WS 업그레이드 헤더가 프록시를 통과하는지** 반드시 확인하세요.
Caddy는 `reverse_proxy`가 WebSocket을 자동으로 처리합니다.

```txt
# Caddyfile

app.example.com {
	reverse_proxy /ws/* localhost:4000
	reverse_proxy localhost:4000
}

dashboard.example.com {
	reverse_proxy localhost:3000
}
```

Nginx 등 다른 프록시를 쓴다면 `Upgrade`/`Connection` 헤더를 명시적으로 전달해야
WebSocket 연결이 유지됩니다.

## 6. 업그레이드

```bash
cd aidetalk/docker
docker compose pull
docker compose up -d
```

DB 마이그레이션은 서버 컨테이너의 부팅 엔트리포인트가 자동으로 실행합니다. 메이저 버전
업그레이드 전에는 아래처럼 백업을 먼저 받는 것을 권장합니다.

## 7. 백업

```bash
docker compose exec postgres pg_dump -U aidetalk aidetalk > backup-$(date +%Y%m%d).sql
```

`STORAGE_DRIVER=local`을 쓰고 있다면 `files` 볼륨(첨부파일 등)도 함께 백업하세요.
복구는 새 `postgres` 컨테이너에 동일 파일을 `psql`로 주입하면 됩니다.

```bash
cat backup-20260701.sql | docker compose exec -T postgres psql -U aidetalk aidetalk
```

## 문제가 있나요?

- `server`가 뜨지 않는다면 `docker compose logs server`로 마이그레이션/env 검증 에러 메시지를
  먼저 확인하세요 — 부팅 시 zod로 환경변수를 검증하며, 무엇이 빠졌는지 로그에 그대로 출력합니다.
- 위젯이 사이트에서 안 뜬다면 [위젯 임베드 가이드](/guide/widget-embed)의 CSP 섹션을 확인하세요.
- 그 외 이슈는 GitHub 저장소에 이슈로 남겨주세요.
