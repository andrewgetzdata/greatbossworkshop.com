---
name: ship
description: Stage, commit, push, and open a PR for the current work. Creates a branch if on main, pushes to existing branch if not, and creates or updates the PR.
---

You are shipping the current local changes. Follow these steps:

## Step 1: Check current state

Run `git status` and `git branch --show-current` to understand what branch you're on and what's changed.

If there are no uncommitted changes and no unpushed commits, tell the user there's nothing to ship and stop.

## Step 2: Check for merged PR

If on a feature branch (not `main`), check if the branch's PR has already been merged:

```
gh pr view --json state --jq '.state' 2>/dev/null
```

If the state is `MERGED`, **stop immediately**. Tell the user this branch's PR has already been merged and they should switch to main and create a new branch. Do not push to a branch whose PR has been merged.

## Step 3: Create a branch if on main

If the current branch is `main`:
1. Look at the staged/unstaged changes to infer a short descriptive branch name using conventional naming (`feat/*`, `fix/*`, `refactor/*`, `chore/*`).
2. Create and switch to the new branch: `git checkout -b <branch-name>`

If already on a feature branch, stay on it.

## Step 4: Stage and commit

1. Stage all relevant changes (`git add` specific files — avoid secrets, `.env`, credentials).
2. Review the diff of staged changes.
3. Write a conventional commit message (`feat:`, `fix:`, etc.) that summarizes the changes.
4. Commit. Include the co-author trailer.

If there are already unpushed commits and no new changes, skip this step.

## Step 5: Push

Push the branch to origin: `git push -u origin <branch-name>`

## Step 6: Open or update PR

Check if a PR already exists for this branch: `gh pr view --json url 2>/dev/null`

- **If no PR exists:** Create one with `gh pr create`. Write a concise title and body summarizing all commits on the branch. Use the standard PR template:
  ```
  gh pr create --title "<title>" --body "$(cat <<'EOF'
  ## Summary
  <bullet points>

  ## Test plan
  <checklist>

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```
- **If a PR already exists:** Tell the user the PR was updated with the new push and show the URL.

## Notes
- Never force-push.
- Never push directly to main.
- If any step fails, stop and tell the user what went wrong.
