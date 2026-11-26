# rocky-mem

Engineering experience ledger for DeepSeek Harness.

## What you get

- **Standing context at session start.** Each new session receives your
  preferences and pinned lessons for the current working directory, in a
  `<rockymem-context>` block, before the first turn.
- **Six tools** under `mcp__rockymem__*`: `mem_context`, `mem_search`,
  `mem_get`, `mem_record`, `mem_remember`, `mem_feedback`.
- **The `rocky-mem` skill**, so the agent knows when to consult the ledger and
  when a recorded lesson must not be applied.
- **A ledger, not a log.** Entries carry evidence, a confidence, and an
  `invalid_when` boundary. Contradictions stay visible as contested pairs until
  a human rules on them.

## What gets installed

| Entry | Kind | Role |
|---|---|---|
| `rockymem-runtime` | Host plugin | injects context on `agent/created`; optional retrieval on `agent/pre-step`; serves the skill; registers `/rockymem` |
| `mcp-rockymem` | MCP client | exposes the six `mem_*` tools over stdio |

The plugin talks to a running `rockymem serve` over its public REST contract
(`GET /api/v1/doctor`, `POST /api/v1/context`, `POST /api/v1/search`). It never
reads the database, never shells out, and has no runtime dependencies.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `endpoint` | `http://127.0.0.1:7432` | daemon base URL (`ROCKYMEM_URL` wins) |
| `tokenFile` | `~/.local/share/rocky-mem/rocky-mem.token` | bearer token (`ROCKYMEM_TOKEN` wins) |
| `inject.enabled` | `true` | session-start injection |
| `inject.budgetTokens` | `500` | pack ceiling |
| `inject.timeoutMs` | `150` | hard per-call budget |
| `preStep.enabled` | `false` | task-time retrieval before the first step |

Overrides live in the profile's `cordis.patch.yml`, keyed by entry id.

## Failure behaviour

A memory service that is down must never slow a session down.

- daemon unreachable: no injection, one warning at load;
- call over budget: that injection is dropped;
- three consecutive failures: circuit opens for 60 s;
- server without the `context` feature: injection skipped;
- subagent session: never injected.

## Verify

Run `/rockymem status` in any session: it prints the endpoint, the contract and
server version, how many packs were injected, and why injections were skipped.
`/rockymem on`, `/rockymem off`, and `/rockymem prestep` toggle behaviour for the
current process only.

## Known limitations

- Task-time retrieval ships disabled; it is off until you have watched the logs
  on your own host and decided the token cost is worth it.
- The plugin degrades rather than queues: context missed while the daemon was
  down is not replayed on recovery.
- Retrieval quality is the server's; this plugin only decides when to ask.

## Links

- Server and contract: https://github.com/linyu19872008/rocky-mem
- Repository: https://github.com/linyu19872008/rocky-mem-dsh
