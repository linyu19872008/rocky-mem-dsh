# Security policy

## Supported versions

Only the latest published version of `rocky-mem-dsh` receives fixes. The bundle
is small and version-pinned on purpose; there is no LTS branch.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private advisory form:

<https://github.com/linyu19872008/rocky-mem-dsh/security/advisories/new>

Include the version, the DSH version, and the smallest reproduction you can.

## What this plugin can do

Knowingly, and by design:

- It reads a bearer token from a file path you configure (`tokenFile`) or from
  `ROCKYMEM_TOKEN`, and uses it against the rocky-mem daemon you configure.
- It sends the working directory (`cwd`) and, when `preStep` is enabled, the
  first prompt of a turn to that daemon, so it can return a context pack.
- It injects the returned text into the session as a tagged user message.

It does **not** read the rocky-mem database, shell out, run install scripts, or
contact any host other than the configured endpoint. `npm install` runs no
lifecycle scripts.

## Threat model notes

- The token file is the only secret; protect it like any API key. The plugin
  never logs it.
- A malicious or compromised daemon can return arbitrary text into your session.
  Point `endpoint` only at a service you trust.
- Context packs can contain instructions. The plugin wraps them in
  `<rockymem-context>` and asks the model to treat them as data, but prompt
  injection remains a risk inherent to any memory system.
