## What and why

## Failure behaviour

- [ ] Daemon absent / unreachable: still no throw, no delay
- [ ] Budget respected (`timeoutMs`), and the skip is counted

## Checks

- [ ] `node --test test/*.test.mjs`
- [ ] `npm pack --dry-run` file list unchanged or explained
- [ ] `README.md` + `docs/DETAIL.md` updated for any new config key
- [ ] `CHANGELOG.md` entry for user-visible behaviour
