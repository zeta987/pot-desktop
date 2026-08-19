# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker (`zeta987/pot-desktop`).

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Current state on the fork

Three of the five roles exist on `zeta987/pot-desktop` and are ready to use:

| Label             | Colour    | Origin                                     |
| ----------------- | --------- | ------------------------------------------ |
| `ready-for-agent` | `#0E8A16` | Created for this setup                     |
| `ready-for-human` | `#1D76DB` | Created for this setup                     |
| `wontfix`         | `#FFFFFF` | One of GitHub's stock labels, reused as-is |

`ready-for-agent` is the one that must exist: `/to-spec` and `/to-tickets` both apply it directly to the issues they publish, skipping triage entirely because their output is agent-ready by construction. Those two sit on the main flow, so a missing label would break an ordinary build session, not just a triage session.

`ready-for-human` marks work that needs human judgement and cannot be delegated to an AFK agent — design trade-offs, decisions with external context, anything needing manual testing.

`needs-triage` and `needs-info` are **deliberately not created**. This repo is a personal fork where every issue is self-filed, so `/triage` — which exists to process requests you did not write — has nothing to process, and those two roles only appear inside its state machine. Create them if outside reporters ever start filing issues here:

```bash
gh label create needs-triage --repo zeta987/pot-desktop --color FBCA04 --description "Maintainer needs to evaluate this issue"
gh label create needs-info --repo zeta987/pot-desktop --color D4C5F9 --description "Waiting on reporter for more information"
```

Note the `--repo` flag in every command — `gh` resolves to the upstream parent on a fork, so omitting it would create the labels on `pot-app/pot-desktop`.
