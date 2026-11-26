# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-11-27

### Fixed

- `peerDependencies` are now optional: the code already degrades when
  `@deepseek-ai/dsh-llm` or `@deepseek-ai/dsh-mcp-client` cannot be resolved, so
  npm no longer pulls a 9 MB provider tree for a bundle with no runtime
  dependencies.
- The generated plugin index ships `icons/rocky-mem.svg` beside `index.json`, so
  the card's icon no longer resolves to a 404 when the artifact is hosted as-is.

## [Unreleased]

### Added

- Host plugin `rockymem-runtime`: injects the `mem_context` pack on
  `agent/created` for `startup` and `clear` sessions.
- Optional `agent/pre-step` retrieval (disabled by default in 0.1.0).
- Circuit breaker and 150 ms budget so a stopped daemon never slows a session.
- MCP client entry exposing rocky-mem's six tools over stdio.
- Packaged skill provider reading `rocky-mem-skill`, with an embedded fallback.
- Market metadata: icon, locale, `engines.dsh`, and a release workflow that
  generates a format-1 index entry.

### Changed

- Injected messages are now built locally (`lib/message.js`: UUID + deep freeze)
  instead of via a bare `@deepseek-ai/dsh-llm` import, which cannot resolve from
  a profile. The upstream constructor is still preferred when available.
- Documented the Streamable HTTP transport switch for `mcp-rockymem`.

## [0.1.0] - 2026-11-26

- First public skeleton.
