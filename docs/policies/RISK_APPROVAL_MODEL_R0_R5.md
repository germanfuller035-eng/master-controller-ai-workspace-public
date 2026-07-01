# Risk Approval Model R0-R5

Status: foundation v1 contract.

| Risk | Scope | Approval |
| --- | --- | --- |
| R0 | Read, search, analyze, classify. | Automatic. |
| R1 | Local tests, drafts, reports. | Automatic. |
| R2 | Worktree, commit, PR, internal tasks. | Automatic with journal. |
| R3 | Low-risk internal changes. | Policy gate. |
| R4 | Send, publish, production deploy, production DB write. | Owner approval. |
| R5 | Payment, deletion, permissions, secrets, irreversible actions. | Strong owner approval. |

## Operating Rules

- R0-R2 cannot bypass data classification.
- R3 requires policy evaluation before execution.
- R4 and R5 require owner-visible approval payloads.
- STOP revokes active approvals and blocks new risky tasks.

## Foundation Boundary

R4 and R5 are defined here but not executable in foundation v1.
