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

## Step 4.5: Run local checks before pushing

Run the same gates CI will run, so nothing broken reaches a PR:

```
npm run typecheck   # astro check + tsc on netlify/functions — catches type errors the editor/build miss
npm test            # (also runs typecheck) unit tests
npm run build       # production build
```

If any fails, **stop and fix it before pushing** — don't open a PR on red. (Type errors in particular, e.g. a wrong property name on an SDK call, won't fail `astro build` but will fail `typecheck`.) If the repo lacks one of these scripts, skip that command.

## Step 5: Push

Push the branch to origin: `git push -u origin <branch-name>`

## Step 6: Open or update PR

Check if a PR already exists for this branch: `gh pr view --json url 2>/dev/null`

Write every **Test plan** item as a concrete, checkable step — a command to run, an endpoint to hit, a specific UI behavior to observe — never a vague "looks good". Each item must be something you can actually validate in Step 7. Leave all items unchecked (`- [ ]`) at creation; Step 7 checks them.

- **If no PR exists:** Create one with `gh pr create`. Write a concise title and body summarizing all commits on the branch. Always assign the PR to the current user with `--assignee @me`. Use the standard PR template:
  ```
  gh pr create --assignee @me --title "<title>" --body "$(cat <<'EOF'
  ## Summary
  <bullet points>

  ## Test plan
  <checklist>

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```
- **If a PR already exists:** Tell the user the PR was updated with the new push and show the URL.

## Step 7: Validate the test plan

Don't leave the test plan as unverified boxes. Actually run each item you can:

1. **Execute the checkable items.** Run the commands (`npm test`, `npm run build`, `curl` an endpoint), and for UI/behavioral items drive them however you can (headless browser, request interception to simulate failure/empty states, inspecting served output). Prefer real evidence over inference.
2. **Check the boxes you proved.** Edit the PR body to mark validated items `- [x]`. If `gh pr edit` fails on a projects-classic GraphQL deprecation error, update the body via REST instead: `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -f body="$(cat body.md)"`.
3. **Leave genuinely manual items unchecked**, and say plainly which ones need a human (e.g. "confirm the production deploy goes green after merge") rather than checking them on inference.
4. **Post an evidence comment** on the PR summarizing what was validated and how (a short table: check → result → evidence), via `gh api -X POST repos/<owner>/<repo>/issues/<n>/comments -f body=...`.

The goal: every checked box is backed by evidence the user can see in the PR, and every unchecked box has a stated reason.

## Notes
- Never force-push.
- Never push directly to main.
- Always assign new PRs to the current user (`--assignee @me`).
- Every test-plan item must be written to be verifiable, and validated in Step 7 — check only boxes backed by real evidence.
- If any step fails, stop and tell the user what went wrong.
