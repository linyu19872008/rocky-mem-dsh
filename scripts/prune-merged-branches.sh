#!/usr/bin/env bash
# Delete remote branches whose pull request is merged and which have no open PR.
# Dry run by default; pass --apply to delete. Never touches main/master,
# dependabot branches, or a branch with any open PR.
#
#   scripts/prune-merged-branches.sh                 # show what would go
#   scripts/prune-merged-branches.sh --apply
#   scripts/prune-merged-branches.sh --repo owner/name --apply
set -euo pipefail

APPLY=0
REPO=""
PROTECTED="main master"

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --repo) REPO="${2:-}"; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

command -v gh >/dev/null 2>&1 || { echo "gh CLI is required" >&2; exit 1; }
[ -n "$REPO" ] || REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

if [ "$APPLY" = 1 ]; then mode="apply"; else mode="dry run"; fi
echo "repository: $REPO ($mode)"

gone=0
kept=0

for branch in $(gh api "repos/$REPO/branches?per_page=100" -q '.[].name'); do
  case " $PROTECTED " in
    *" $branch "*) echo "keep   $branch  (protected)"; kept=$((kept + 1)); continue ;;
  esac
  case "$branch" in
    dependabot/*) echo "keep   $branch  (dependabot)"; kept=$((kept + 1)); continue ;;
  esac

  open="$(gh pr list --repo "$REPO" --head "$branch" --state open --json number -q 'length')"
  if [ "$open" != "0" ]; then
    echo "keep   $branch  (open PR)"; kept=$((kept + 1)); continue
  fi

  merged="$(gh pr list --repo "$REPO" --head "$branch" --state merged --json number -q 'map("#\(.number)") | join(" ")')"
  if [ -z "$merged" ]; then
    echo "keep   $branch  (no merged PR)"; kept=$((kept + 1)); continue
  fi

  if [ "$APPLY" = 1 ]; then
    gh api -X DELETE "repos/$REPO/git/refs/heads/$branch" >/dev/null
    echo "delete $branch  ($merged)"
  else
    echo "would  $branch  ($merged)"
  fi
  gone=$((gone + 1))
done

echo "---"
if [ "$APPLY" = 1 ]; then echo "deleted: $gone"; else echo "would delete: $gone"; fi
echo "kept: $kept"
[ "$APPLY" = 1 ] || echo "re-run with --apply to delete"
