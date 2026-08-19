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

`wontfix` already exists as one of GitHub's stock labels and can be used as-is. The other four do not exist yet and need creating once — note the `--repo` flag, since `gh` defaults to the upstream parent on a fork:

```bash
gh label create needs-triage --repo zeta987/pot-desktop --color FBCA04 --description "Maintainer needs to evaluate this issue"
gh label create needs-info --repo zeta987/pot-desktop --color D4C5F9 --description "Waiting on reporter for more information"
gh label create ready-for-agent --repo zeta987/pot-desktop --color 0E8A16 --description "Fully specified, ready for an AFK agent"
gh label create ready-for-human --repo zeta987/pot-desktop --color 1D76DB --description "Requires human implementation"
```
