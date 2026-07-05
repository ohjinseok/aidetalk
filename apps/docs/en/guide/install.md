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
| `ALLOW_INSECURE_AGENT_ENDPOINT` | `false` | | Whether to allow `http://` Agent endpoints (e.g. for local dev). Keep `false` in production |
| `SMTP_URL` | (none) | | If unset, all email sending is skipped and logged instead (default self-hosting behavior) |
| `LOG_LEVEL` | `info` | | pino log level |
| `TELEMETRY` | `false` | | Opt-in anonymous telemetry. Collects: install UUID, version, workspace count — nothing beyond that |

Never commit secrets (`VISITOR_TOKEN_SECRET`, `SESSION_SECRET`, `SECRET_ENC_KEY`, etc.) to
code or logs. Logs always mask them (e.g. `sk_live_ab****`).

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
