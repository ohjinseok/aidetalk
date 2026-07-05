# Example Agents

::: tip Translation in progress
The full English translation of this page isn't ready yet. Please see the
**[Korean version of this page](/guide/examples)** for the complete guide.
A quick summary follows.
:::

The repository ships with two ready-to-run minimal example agents that both
implement the [Agent Protocol](/en/guide/agent-protocol):

- `examples/agent-node` — Node/Hono + Claude API
- `examples/agent-python` — Python/FastAPI + Claude API

Both answer visitor questions from a sample shop FAQ, hand off to a human
agent when they can't answer (or when the request needs a human, like a
refund), and can suggest draft replies to a human agent in assist mode.

Each example's README starts with the same onboarding line (in Korean, since
the target audience for this quick-start flow is Korean-speaking SMB
developers using Claude Code):

> "Open this repo in Claude Code and say '고쳐줘' (fix this to match our shop's
> policies)."

In short: replace `faq.md` with your own policies, then ask a coding agent
(Claude Code or otherwise) in natural language to adjust the tone and
handoff rules. See the [Korean guide](/guide/examples) for full setup and run
instructions for both examples.
