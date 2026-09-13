# Contributing

`main` is protected: **changes land only through pull requests**. Direct pushes are rejected.

## Workflow

1. Create a branch from an up-to-date `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feat/short-description
   ```
2. Commit locally, then push the branch:
   ```bash
   git push -u origin HEAD
   ```
3. Open a PR and merge it (squash, merge commit, or rebase are all allowed):
   ```bash
   gh pr create --title "…" --body "…"
   gh pr merge --squash
   ```

Force-pushes and deleting `main` are blocked. Approvals are not required (solo-friendly), but every change still goes through a PR for reviewable history.
