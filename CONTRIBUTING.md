# Contributing

Thanks for looking. This is a small bundle with a narrow job: decide *when* to
inject rocky-mem context, and stay out of the way when the daemon is absent.

## Before you start

- Read `docs/DETAIL.md` for the runtime behaviour and `lib/inject.js` for the
  gates. The design rule is: **a memory service that is down must never slow down
  or break a session.**
- Correctness (gates, ranking, pack assembly) belongs to the rocky-mem server,
  not here. If your change needs server behaviour, open it there first.

## Development

```sh
node --test test/*.test.mjs     # 15 cases, no network, no daemon
npm pack --dry-run              # confirm the shipped file list
node scripts/gen-market-entry.mjs --index   # the market artifact
```

Tests stub `fetch` and the host context, so nothing external is required.

## What a good change looks like

- A new injection gate needs a test that proves the *skip* as well as the
  inject. Most value is in not injecting.
- A new config key needs: a default, a line in `README.md`, a line in
  `docs/DETAIL.md`, and a mention in `cordis.patch.yml` if it is worth tuning.
- Behaviour changes that alter what an agent sees are user-visible; say so in
  `CHANGELOG.md`.

## Commit and PR

Conventional commits (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`). PRs run
`syntax → node --test → npm pack → market index` and must pass before merge; the
`main` branch is protected.


## Branches

Branches are disposable; tags are the record. Merging a PR deletes its head
branch automatically, and only `main` lives indefinitely. For a branch that was
closed without merging, use `scripts/prune-merged-branches.sh` (dry run by
default, `--apply` to delete; it never touches `main` or `dependabot/*`).

## Releasing

1. Bump `package.json` and add a `CHANGELOG.md` entry.
2. `npm publish` (the account requires 2FA; CI can publish when `NPM_TOKEN` is
   set as a repository secret).
3. Tag `v<version>` and push; the release workflow generates the index artifact
   and the GitHub release.
