<p align="center">
  <img src="assets/brand/icon-512.png" width="140" alt="rocky-mem mascot">
</p>

# rocky-mem-dsh

**rocky-mem for DeepSeek Harness.** Session-start context injection, optional
task-time retrieval, and the portable `rocky-mem` skill — installed as one
plugin, decoupled from the server by its public contract.

> 记忆是状态，经验是台账。这个插件负责**时机**：什么时候把台账递给 agent。

[![ci](https://github.com/linyu19872008/rocky-mem-dsh/actions/workflows/ci.yml/badge.svg)](https://github.com/linyu19872008/rocky-mem-dsh/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/rocky-mem-dsh)](https://www.npmjs.com/package/rocky-mem-dsh)
[![license](https://img.shields.io/github/license/linyu19872008/rocky-mem-dsh)](LICENSE)
[![dsh](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.2--rc.1-4b5563)](https://github.com/deepseek-ai/deepseek-harness)


## What it does

| Layer | Responsibility | Where it lives |
|---|---|---|
| Correctness | gates, ranking, pack assembly, conflict handling | `rocky-mem` (Go service) |
| Timing | when to inject, budgets, circuit breaker, degradation | **this plugin** |
| Behaviour | how the agent should use the tools | `rocky-mem-skill` (bundled) |

Three pieces, wired together:

1. **`rockymem-runtime`** — a Host plugin. On `agent/created` it asks the daemon
   for `mem_context` and injects the pack as a tagged user message. On
   `agent/pre-step` (opt-in) it can retrieve a task pack before the first step.
2. **`mcp-rockymem`** — `@deepseek-ai/dsh-mcp-client` exposing the six
   `mem_*` tools over stdio.
3. **Skill** — a packaged skill provider reading `rocky-mem-skill`; a short
   embedded body is used when that package is absent.

## Install

```sh
dsh plugin --profile web add rocky-mem-dsh
```

Then start the daemon the plugin talks to:

```sh
rockymem serve --dsn sqlite://$HOME/.local/share/rocky-mem/rocky-mem.db
```

Restart `dsh web`. On the Plugins page the bundle appears as **rocky-mem**.

## Configure

Everything has a working default; edit the `rockymem-runtime` entry only when
your daemon lives elsewhere.

| Key | Default | Meaning |
|---|---|---|
| `endpoint` | `http://127.0.0.1:7432` | daemon base URL (`ROCKYMEM_URL` wins) |
| `tokenFile` | `~/.local/share/rocky-mem/rocky-mem.token` | bearer token (`ROCKYMEM_TOKEN` wins) |
| `doctorCacheMs` | `60000` | capability probe cache |
| `inject.enabled` | `true` | session-start injection |
| `inject.onSources` | `[startup, clear]` | `SessionStartSource` values that receive it |
| `inject.budgetTokens` | `500` | pack ceiling |
| `inject.timeoutMs` | `150` | hard per-call budget |
| `preStep.enabled` | **`false`** | task-time retrieval (see below) |
| `preStep.budgetTokens` | `400` | pack ceiling per turn |
| `preStep.minPromptChars` | `12` | shorter prompts are never searched |

### Why `preStep` ships off

`agent/pre-step` runs on every step. Enabling it makes retrieval *deterministic*
instead of hoping the model calls `mem_search`, at the cost of one HTTP call and
up to 400 tokens per turn. Turn it on after you have checked the logs on your
own host:

```yaml
- id: rockymem-runtime
  config:
    preStep:
      enabled: true
```

## Transports

The MCP entry ships on **stdio** because it needs no secret in configuration:
`rockymem mcp` reads the token file itself and proxies to a running daemon.
Switch to **Streamable HTTP** when the daemon is remote or you would rather not
spawn a child process per client:

```yaml
- id: mcp-rockymem
  config:
    transport: streamable-http
    url: http://127.0.0.1:7432/mcp
    headers:
      Authorization: !!js '`Bearer ${process.env.ROCKYMEM_TOKEN}`'
```

The HTTP transport is stateless; `GET /mcp` answers 405 by design.

## Degradation

A memory service that is down must never slow a session down.

| Situation | Behaviour |
|---|---|
| daemon stopped | no injection; one warning at load; session unaffected |
| call exceeds the budget | that injection is dropped |
| 3 consecutive failures | circuit opens for 60 s; no calls are attempted |
| `doctor` lacks `context` | injection skipped (older server) |
| subagent session | never injected |

## Compatibility

### Why `engines.dsh`

The bundle declares `dsh >= 0.2.2-rc.1` because it relies on `agent/pre-step`
and `ctx.skills.registerProvider`. Marketplace cards use that field to offer only
compatible versions; if the Plugins page says "incompatible", this is why.

- DSH `>= 0.2.2-rc.1` (`engines.dsh`), Node `^22.19 || >=24`.
- rocky-mem contract `>= 1`; the plugin degrades when the server lacks a feature.
- The plugin never reads rocky-mem's database or config files.

## Development

```sh
node --check lib/index.js
npm pack --dry-run
```

## License

MIT — see [LICENSE](LICENSE).
