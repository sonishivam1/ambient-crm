# Git workflow

## Branches

```mermaid
gitGraph
  commit id: "main"
  branch feat/accounts-list
  checkout feat/accounts-list
  commit id: "accounts query"
  commit id: "accounts page"
  checkout main
  merge feat/accounts-list id: "PR merged"
  branch fix/palette-scope
  checkout fix/palette-scope
  commit id: "fix + test"
  checkout main
  merge fix/palette-scope
```

- `main` is always deployable. No direct pushes once CI exists; until then, keep
  commits small and checked.
- Branch names: `feat/…`, `fix/…`, `docs/…`, `chore/…`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):
`feat(accounts): list customer groups with health filter`. The subject says
what changed for the user; the body says why and anything a reviewer must know.

## Pull requests

Every PR:
- describes the change and how it was verified (commands run, pages checked);
- updates the docs it affects in the same PR;
- passes type-check and lint (and tests, once they exist);
- contains **no secrets**: no connection strings, keys or tokens. `.env*` files
  are gitignored; check `git diff --cached` before committing.

## Releases

Planned with CI/CD: every merge to `main` deploys to staging; production deploys
are tagged `vYYYY.MM.DD` with release notes generated from commit subjects.
