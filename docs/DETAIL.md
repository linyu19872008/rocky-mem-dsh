# rocky-mem

**工程经验台账 for DeepSeek Harness.**

## What you get

- **Session-start context.** Each new session receives your standing
  preferences and pinned lessons for the current working directory, in a
  `<rockymem-context>` block, before the first turn.
- **Six tools** under the `mcp__rockymem__*` namespace: `mem_context`,
  `mem_search`, `mem_get`, `mem_record`, `mem_remember`, `mem_feedback`.
- **The `rocky-mem` skill**, so the agent knows when to consult the ledger and
  when a recorded lesson must not be applied.
- **A ledger, not a log.** Entries carry evidence, a confidence, and an
  `invalid_when` boundary. Contradictions stay visible instead of being
  overwritten.

## How it is wired

```
agent/created ──▶ rockymem-runtime ──HTTP──▶ GET /api/v1/doctor
                                     └────▶ POST /api/v1/context ──▶ agent.inject(...)
agent/pre-step ─▶ (opt-in) ────────────────▶ POST /api/v1/search ──▶ appended message
MCP tool call ──▶ dsh-mcp-client ──stdio──▶ rockymem mcp ──▶ daemon
```

Only the public REST contract and the MCP protocol are used. There is no
shared code, no database access, and no assumption about internal tables.

## Configuration

| Key | Default | Notes |
|---|---|---|
| `endpoint` | `http://127.0.0.1:7432` | `ROCKYMEM_URL` overrides |
| `tokenFile` | `~/.local/share/rocky-mem/rocky-mem.token` | `ROCKYMEM_TOKEN` overrides |
| `inject.enabled` | `true` | session-start pack |
| `inject.onSources` | `[startup, clear]` | skip `resume`/`compact` |
| `preStep.enabled` | `false` | task-time retrieval |

The token is written by `rockymem serve` next to its database
(`<db-stem>.token`, mode 600) or under `$ROCKYMEM_HOME/pg-<hash>/` for
PostgreSQL.

## Failure behaviour

The plugin treats every failure as "no context this time":

- unreachable daemon → skip, warn once;
- 150 ms budget exceeded → drop that injection;
- 3 consecutive failures → 60-second circuit, no calls attempted;
- server without the `context` feature → no injection, tools still available.

No path blocks, delays, or fails a turn.

## Verify it works

1. Start the daemon: `rockymem serve`.
2. Open a new DSH session in a project that has at least one memory entry.
3. The first message should contain a `<rockymem-context kind="standing">` block.
4. Ask the agent to record a lesson; `mem_record` should answer with
   `status: pending_review` unless evidence, `applies_when`, and confidence
   all pass the gate.

## Known limitations (0.1.0)

- `preStep` ships disabled; enable it after checking your host's logs.
- The plugin builds injected messages locally (UUID + deep freeze) and only
  uses `@deepseek-ai/dsh-llm`'s constructor when that package resolves from the
  profile. The local factory mirrors the upstream shape field for field; a
  future message field would be missed until the plugin is updated.
- MCP ships on stdio. Streamable HTTP is supported by the server and can be
  selected in `mcp-rockymem` for remote daemons.

## Uninstall

Remove the bundle on the Plugins page (or `dsh plugin --profile web remove
rocky-mem-dsh`). Nothing outside the profile is written.
