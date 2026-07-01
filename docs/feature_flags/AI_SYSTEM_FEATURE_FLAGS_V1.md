# AI System Feature Flags V1

Status: foundation v1 architecture.

## Lifecycle States

`OFF`, `LOCAL_SYNTHETIC`, `SHADOW`, `PRODUCTION_READ_ONLY`, `DRAFT_ONLY`, `OWNER_APPROVAL_REQUIRED`, `LIMITED_AUTONOMY`.

## Default

All new capabilities start `OFF`.

## Flags

| Flag | Initial | Risk max | Required approval | Purpose |
| --- | --- | --- | --- | --- |
| AGENT_RUNTIME | OFF | R3 | Owner approval before promotion. | Future agent runtime. |
| MCP_READ | OFF | R3 | Policy gate and owner approval for production read. | Future read-only tool gateway. |
| MCP_WRITE | OFF | R5 | Strong owner approval. | Future write-capable tools. |
| MEMORY_WRITE | OFF | R3 | Policy gate and owner approval. | Future long-term memory writes. |
| KNOWLEDGE_INGEST | OFF | R2 | Owner approval for external/scheduled ingest. | Future knowledge ingestion. |
| COMMERCIAL_DRAFT | OFF | R3 | Policy gate. | Future commercial draft generation. |
| OUTBOUND_EMAIL | OFF | R4 | Owner approval per payload hash. | Future email sends. |
| OUTBOUND_SOCIAL | OFF | R4 | Owner approval per payload hash. | Future social publishing. |
| PRODUCTION_DEPLOY | OFF | R4 | Owner approval. | Future production deploys. |
| PRODUCTION_DB_WRITE | OFF | R4 | Owner approval. | Future production DB writes. |
| PAYMENTS | OFF | R5 | Strong owner approval. | Future payments or purchases. |
| VOICE | OFF | R3 | Policy gate; screen confirmation for risky actions. | Future push-to-talk. |
| AUTO_SAFE | OFF | R3 | Policy gate and owner-approved allowlist. | Future limited autonomy. |

## Rollback

Rollback for every flag begins by setting it to `OFF`, revoking active approvals, checkpointing active workflows, and reporting affected actions.

## Evidence Required

Promotion requires registry validation, policy tests, data-class review, STOP behavior, and owner-facing evidence.
