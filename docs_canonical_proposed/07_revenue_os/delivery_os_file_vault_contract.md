---
type: integration_contract
status: proposed
related_project: delivery-os
updated: 2026-06-17
canonical_target: 07_revenue_os/delivery_os_file_vault_contract.md
apply_status: PROPOSED_AFTER_SOAK
tags: [delivery_os, file_vault, contract, future, dry_run]
---

# Delivery OS ↔ File Vault — Future Routing Contract (dry-run only)

> Future routing rules for client-project files. **No live file moves.** Dry-run only. Reuses the
> AI HQ File Vault dry-run model — no second file system.

## Categories
client_inputs · contracts · commercial · brand_assets · content · credentials_references ·
deliverables · review_files · acceptance · support · case_evidence.

## Rules
- **Hash** every file (sha256); **dedupe** by hash.
- **Safe naming** (normalize; no overwrite).
- **Sensitive classification** (legal/medical/identity/financial/credentials → restricted index).
- **No secrets in Obsidian.** Credential files reference `D:\AI_SECRETS` only; values never stored.
- **Original preserved** (never modify/delete originals).
- **Project linkage** (every file linked to a `project_id`).
- **Retention** policy per category; **client permission** required before any external use (case evidence).

## Routing (proposed destinations, dry-run)
| Category | Destination | Sensitivity |
| --- | --- | --- |
| client_inputs | `D:\AI_FILE_VAULT\projects\<project_id>\inputs` | per-file |
| contracts / commercial | restricted index | sensitive |
| brand_assets / content | project folder | normal |
| credentials_references | reference card only (value in `D:\AI_SECRETS`) | credentials |
| deliverables / review_files | project folder | normal |
| acceptance | project folder | normal |
| case_evidence | restricted until client permission | sensitive |

## Boundaries
- No live moves; intake is DRY_RUN (proposes destinations + index cards).
- No second File Vault; uses the existing AI HQ File Vault dry-run pipeline.

## Related
- [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
- AI HQ `tools/ai_hq/file_intake.mjs` (dry-run model)
