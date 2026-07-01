# Risk Explanation Copy V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1

## Owner Copy

R0 means read-only analysis. It can run automatically when the source and data class are allowed.

R1 means local tests, reports, and drafts. It can run automatically when it stays local and has no production side effects.

R2 means worktree edits, commits, pull requests, and internal task changes. It can run automatically with a journal and rollback path.

R3 means low-risk internal change. It needs a policy gate before execution.

R4 means send, publish, production deploy, production database write, or browser action. It requires owner approval tied to the exact payload hash.

R5 means payment, deletion, permission change, secret issuance, direct secret read, or irreversible action. It requires strong owner approval and must be one-time only.
