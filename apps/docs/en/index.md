---
layout: home

hero:
  name: "AideTalk"
  text: "Aide + Talk"
  tagline: "Connect your own AI Agent to your site's chat in 5 minutes."
  actions:
    - theme: brand
      text: Install Guide
      link: /en/guide/install
    - theme: alt
      text: Agent Protocol
      link: /en/guide/agent-protocol
    - theme: alt
      text: GitHub
      link: https://github.com/aidetalk/aidetalk

features:
  - icon: 🤖
    title: Bring your own AI Agent
    details: Your server handles the LLM calls and logic. AideTalk only relays requests over an HTTP connector — any language, any model works.
  - icon: 💬
    title: Open-source CS messenger
    details: Widget + shared inbox + handoff, all free to self-host under the AGPL-3.0 open-source license.
  - icon: 📈
    title: Conversation-attributed revenue (estimate)
    details: Links your agents share are tracked from click to purchase, so you can see an estimate of how much a conversation contributed to a sale.
  - icon: 🎯
    title: Real-time agent assist
    details: While a human agent is handling a conversation, AI suggests draft replies and next actions. Suggestions are visible to the agent only — they are never sent to the visitor.
---

## What is AideTalk?

**AideTalk** is an open-source customer-support messenger built for Korean SMBs, and a
self-hostable alternative to commercial chat widgets. Its biggest differentiator:

> **Connect the AI Agent you already built to your site's chat with a single HTTP connector.**

AideTalk itself never calls an LLM. If you already have an AI Agent running somewhere —
a Claude API-powered backend, an internal RAG server, an n8n workflow, anything — you
only need to register one HTTP endpoint that follows the contract, and it starts talking
to your site's visitors within minutes. See the [Agent Protocol](/en/guide/agent-protocol)
page for the full contract.

## Architecture at a glance

```
[Visitor's browser]                        [Agent's browser]
  Embed widget (<=50KB, Preact)              Shared inbox (dashboard)
     │ WebSocket + HTTP                         │ WebSocket + HTTP
     ▼                                          ▼
┌───────────────────────────────────────────────────────────┐
│  AideTalk server — single Node process (Hono + WebSocket)  │
│                                                             │
│   REST API          WS gateway          Agent Dispatcher    │
│   (session/conv/msg) (realtime fan-out)  (HMAC-signed relay) │
└──────┬───────────────┬─────────────────────┬────────────────┘
       ▼               ▼                     ▼  POST (HMAC, 30s timeout)
   PostgreSQL        Redis                [Your AI Agent server]
   (conversations/    (pub/sub, presence)   (your infra, your LLM key)
    messages/tracking)
```

- **Self-hosted and cloud use the exact same Docker image.** The only difference is
  environment variables.
- The widget is built with Preact (no React), keeping its bundle very small
  (≤50KB gzipped for the main bundle).
- Realtime fan-out defaults to Redis, with an in-memory mode available for
  single-process deployments.

## Where to go next

- Installing for the first time → [Self-hosting Install Guide](/en/guide/install)
- Want to connect your own AI Agent → [Agent Protocol](/en/guide/agent-protocol)
- Curious how to embed the widget on your site → [Widget Embed Guide](/en/guide/widget-embed)
- Want a ready-to-run example → [Example Agents](/en/guide/examples)
