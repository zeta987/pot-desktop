# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues on the fork **`zeta987/pot-desktop`**. Use the `gh` CLI for all operations.

## ⚠️ This repo is a fork — always pass `--repo`

`gh` resolves the target repository from the git remotes, and **on a fork it defaults to the parent** (`pot-app/pot-desktop`). Running a bare `gh issue create` here would open an issue on the upstream project, which violates the fork-only policy in `AGENTS.md`.

Every `gh` command in this file therefore carries an explicit `--repo zeta987/pot-desktop`. Keep it that way. A local `gh repo set-default` may also be configured, but that lives in `.git/config` and does not survive a fresh clone — the explicit flag is the portable guarantee.

## Conventions

-   **Create an issue**: `gh issue create --repo zeta987/pot-desktop --title "..." --body "..."`. Use a heredoc for multi-line bodies.
-   **Read an issue**: `gh issue view <number> --repo zeta987/pot-desktop --comments`, filtering comments by `jq` and also fetching labels.
-   **List issues**: `gh issue list --repo zeta987/pot-desktop --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
-   **Comment on an issue**: `gh issue comment <number> --repo zeta987/pot-desktop --body "..."`
-   **Apply / remove labels**: `gh issue edit <number> --repo zeta987/pot-desktop --add-label "..."` / `--remove-label "..."`
-   **Close**: `gh issue close <number> --repo zeta987/pot-desktop --comment "..."`

## Closing an issue from a PR

**On this repo, a merged PR never closes its issue. Close it by hand.**

GitHub fires a closing keyword only when the PR merges into the repository's **default
branch**, which here is `master`. Work branches target `dev/personal-3.0.7`, so the
keyword never fires — and GitHub does not even register the link. Verified on #3: its
body contained `Closes #1` and `closingIssuesReferences` stayed empty right up to the
merge. A closing keyword in a **commit message** is weaker still; GitHub reads those
only on a push to the default branch.

Write the keyword in the PR body anyway. It tells a human reader which issue the PR
answers, and it starts working on its own the day a PR targets `master`.

Finishing an issue therefore takes four steps:

1.  Put `Closes #<n>` in the **PR body** (not only in a commit message), and add a note
    that auto-close will not fire because of the base branch.
2.  Merge the PR.
3.  Close the issue by hand, naming where the fix landed and which branch it is not on
    yet.
4.  Confirm it took — the issue should report `CLOSED` / `COMPLETED`.

```bash
gh pr merge <pr> --repo zeta987/pot-desktop --merge
gh issue close <n> --repo zeta987/pot-desktop --comment "Fixed in #<pr>, merged into dev/personal-3.0.7 as <sha>. Not on master yet."
gh issue view <n> --repo zeta987/pot-desktop --json state,stateReason
```

The closing comment is the only record a reader gets, so make it carry the diagnosis,
the commits that did the work, how it was verified, and anything the issue asked for
that was deliberately left out. Do not close an issue whose fix is still sitting on an
unmerged branch.

To check whether GitHub has linked a PR to an issue at all:

```bash
gh pr view <n> --repo zeta987/pot-desktop --json closingIssuesReferences
```

An empty array means no link exists, whatever the body says.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

-   **Read a PR**: `gh pr view <number> --repo zeta987/pot-desktop --comments` and `gh pr diff <number> --repo zeta987/pot-desktop` for the diff.
-   **List external PRs for triage**: `gh pr list --repo zeta987/pot-desktop --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
-   **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close` — each with `--repo zeta987/pot-desktop`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42 --repo zeta987/pot-desktop` and fall back to `gh issue view 42 --repo zeta987/pot-desktop`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue on `zeta987/pot-desktop`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --repo zeta987/pot-desktop --comments`.

## Reading upstream issues

Upstream (`pot-app/pot-desktop`) issues are readable and often useful context for a bug that originates in the base project. Reading is fine:

-   `gh issue view <number> --repo pot-app/pot-desktop --comments`
-   `gh issue list --repo pot-app/pot-desktop --search "..."`

Creating, commenting on, labelling, or closing anything on `pot-app/pot-desktop` is **not** permitted without an explicit instruction from the user in the current conversation. See "Repository Policy — Fork-Only Contributions" in `AGENTS.md`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets. All of the below target `--repo zeta987/pot-desktop`.

-   **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --repo zeta987/pot-desktop --label wayfinder:map`.
-   **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
-   **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/zeta987/pot-desktop/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/zeta987/pot-desktop/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
-   **Frontier query**: list the map's open children (`gh issue list --repo zeta987/pot-desktop --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
-   **Claim**: `gh issue edit <n> --repo zeta987/pot-desktop --add-assignee @me` — the session's first write.
-   **Resolve**: `gh issue comment <n> --repo zeta987/pot-desktop --body "<answer>"`, then `gh issue close <n> --repo zeta987/pot-desktop`, then append a context pointer (gist + link) to the map's Decisions-so-far.
