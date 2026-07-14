# Self-hosting Install Guide

> Goal: anyone should be able to read this page and have AideTalk running with a
> first successful conversation within 30 minutes.
> Self-hosted and cloud deployments use **the exact same Docker image**. The only
> difference is environment variables (`EDITION`).

## Prerequisites

- Docker + Docker Compose v2 (check with `docker compose version`)
- `openssl` for generating secrets (preinstalled on most Linux/macOS systems)
- (For production) at least one domain pointing at your server, plus a reverse
  proxy — not required if you're just trying it out locally

## 1. Clone the repo & prepare environment variables

```bash
git clone https://github.com/aidetalk/aidetalk && cd aidetalk/docker
cp .env.example .env
```

Open `.env` and fill in the values below. Generate secrets with:

```bash
openssl rand -hex 32
```

## 2. One-command startup

```bash
docker compose up -d
```

Services come up in order: `postgres` → `redis` → `server` (runs migrations
automatically, then starts) → `dashboard`. Check server health with:

```bash
curl http://localhost:4000/healthz
# {"ok":true}
```

## 3. Create your first workspace

1. Open `http://localhost:3000` in a browser
2. Sign up → create a workspace (choose whether you have a website — S1 — or not — S2)
3. Copy the embed snippet from the widget settings screen and paste it into your site
4. Register an AI Agent endpoint under Workspace Settings > Agent Connectors — if you
   don't have one yet, you can have one running in 5 minutes using an
   [example agent](/en/guide/examples).

That's the "conversation within 30 minutes" baseline. For real-site embedding
details, see the [Widget Embed Guide](/en/guide/widget-embed).

## 4. Environment variable reference

`docker/.env.example` is the actual example file matching the table below.
Items marked `(ee)` are cloud-edition only and aren't needed for self-hosting.

| Variable | Default | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | - | ✅ | Postgres connection string |
| `REDIS_URL` | - | when `PUBSUB_DRIVER=redis` | |
| `PUBSUB_DRIVER` | `redis` | | `redis` \| `memory` (single-process only) |
| `STORAGE_DRIVER` | `local` | | `local` \| `s3` |
| `STORAGE_LOCAL_PATH` | `/data/files` | when local | |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | - | when s3 | S3-compatible storage such as R2/MinIO |
| `SERVER_URL` | - | ✅ | Publicly reachable URL of the server (used for widget embedding and link tagging) |
| `DASHBOARD_URL` | - | ✅ | Allowed CORS origin / basis for invite links |
| `PORT` | `4000` | | Server listening port |
| `VISITOR_TOKEN_SECRET` | - | ✅ | Signing key for visitor session tokens. 32+ random bytes |
| `SESSION_SECRET` | - | ✅ | Signing key for agent/dashboard sessions |
| `SECRET_ENC_KEY` | (none) | | Dedicated AES-256-GCM key (32 bytes, hex or base64) used to encrypt Agent/webhook secrets. If unset, falls back to a key derived from `SESSION_SECRET` and logs a warning at boot. Recommended to set explicitly if you want to rotate session keys independently |
| `EDITION` | (none) | | `cloud` loads cloud-only (ee) modules. Leave unset for self-hosting |
| `ALLOW_INSECURE_AGENT_ENDPOINT` | `false` | | Relaxes the SSRF guard on Agent/webhook endpoints. The default (`false`) allows only `https` endpoints that resolve to public IPs. Set `true` only to reach an Agent on your own internal network — see below |
| `ALLOW_PUBLIC_SIGNUP` | `false` | | Whether public sign-up is allowed. Even with the default, the **first sign-up on a fresh instance (zero users)** and **sign-ups from invited emails** are always allowed — i.e. public sign-up closes automatically once the first admin account exists, and teammates join by invite. Set `true` to let anyone sign up |
| `SMTP_URL` | (none) | | If unset, all email sending is skipped and logged instead (default self-hosting behavior) |
| `LOG_LEVEL` | `info` | | pino log level |
| `TELEMETRY_ENABLED` | `false` | | **Opt-in** anonymous telemetry. Off by default; only runs when explicitly set to `true` |
| `TELEMETRY_ENDPOINT` | placeholder domain | | Telemetry destination URL. Marked as TODO in code until a real collection domain is confirmed |

Never commit secrets (`VISITOR_TOKEN_SECRET`, `SESSION_SECRET`, `SECRET_ENC_KEY`, etc.) to
code or logs. Logs always mask them (e.g. `sk_live_ab****`).

### Reaching an Agent on your internal network (`ALLOW_INSECURE_AGENT_ENDPOINT`)

The AideTalk server makes outbound requests to the Agent endpoints and webhook URLs you
register. With the default (`false`), an endpoint must use `https` and must resolve to a public
IP — private/loopback ranges (`10.x`, `172.16–31.x`, `192.168.x`, `127.x`, `::1`, `fc00::/7`) are
rejected both at registration time and at dispatch time.

Without this check, a workspace member could point an endpoint at
`http://169.254.169.254/...` (cloud metadata) or an intranet address and have the server fetch it
for them, with the response surfacing in the conversation (SSRF — on an AWS/GCP VM this can leak
instance credentials).

If your Agent runs on the same Docker network or LAN (e.g. `http://my-agent:8080`,
`http://192.168.1.10:3000`, or `http://localhost:5000` during local development), set
`ALLOW_INSECURE_AGENT_ENDPOINT=true`. Understand the trade-off: once enabled, the server will
send requests to internal addresses chosen by workspace members. Only enable it when every member
is trusted.

Even with the flag on, link-local / cloud metadata ranges (`169.254.0.0/16`, `fe80::/10`,
`fd00:ec2::254`) are **always blocked**.

### Telemetry (opt-in) collected fields

Off by default (`TELEMETRY_ENABLED=false`). Even when enabled, no conversation content,
messages, emails, or other PII is collected — the fields below are the entire payload. Sent
once a week; send failures are silently ignored.

| Field | Description |
|---|---|
| Instance anonymous ID | Randomly generated on first send and stored in the DB. A fresh install generates a new one |
| Version | Server version |
| Workspace count | Total workspace *count* only |
| Conversation count | Total conversation *count* only (no message bodies) |
| Agent (connector) count | Registered AI connector *count* only (no endpoint URLs) |

## 5. Reverse proxy (Caddy example)

In production you'll need a reverse proxy for TLS termination and domain routing.
AideTalk uses WebSocket (`/ws/*`), so make sure **the WS upgrade headers pass
through your proxy**. Caddy handles WebSocket automatically with `reverse_proxy`.

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

If you use Nginx or another proxy, make sure to explicitly forward the
`Upgrade`/`Connection` headers, or the WebSocket connection won't stay alive.

## 6. Upgrading

```bash
cd aidetalk/docker
docker compose pull
docker compose up -d
```

DB migrations run automatically via the server container's boot entrypoint.
We recommend taking a backup (below) before a major version upgrade.

## 7. Backup

```bash
docker compose exec postgres pg_dump -U aidetalk aidetalk > backup-$(date +%Y%m%d).sql
```

If you use `STORAGE_DRIVER=local`, back up the `files` volume (attachments, etc.)
as well. To restore, spin up a fresh `postgres` container and pipe the same file
through `psql`:

```bash
cat backup-20260701.sql | docker compose exec -T postgres psql -U aidetalk aidetalk
```

## Troubleshooting

- If `server` doesn't come up, check `docker compose logs server` first — env
  variables are validated with zod at boot, and the log clearly states which
  variable is missing and why it's required.
- If the widget doesn't show up on your site, check the CSP section of the
  [Widget Embed Guide](/en/guide/widget-embed).
- For anything else, please open an issue on GitHub.
