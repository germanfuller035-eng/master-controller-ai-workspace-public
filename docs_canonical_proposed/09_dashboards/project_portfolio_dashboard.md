---
type: dashboard
status: canonical
related_project: obsidian_hq
updated: 2026-06-17
generated_from_inventory: inventory_20260617_025903.json
registry_version: 2.0
release_version: v0.4.0-rc1
canonical_target: 09_dashboards/project_portfolio_dashboard.md
apply_status: PROPOSED_AFTER_SOAK
tags: [dashboard, portfolio]
---

# Project Portfolio Dashboard (canonical)

> Single canonical portfolio dashboard. Views below are **sections of one file** — do not create
> separate dashboard files per view. Source of truth: [[00_MASTER_CONTEXT/PROJECT_REGISTRY]].

## Master view

| Project | Status | Priority | Revenue | Operational impact | Last verified | Release | Branch | Next milestone | Blocker | Owner action | Agent | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| master_controller | ACCEPTANCE | P0_CRITICAL | indirect | critical | 2026-06-17 | v0.4.0-rc1 | mc-lead-hunter-integ | Soak → acceptance | Soak freeze | Acceptance after soak | claude | high |
| telegram_master_controller | ACTIVE_PRODUCTION | P0_CRITICAL | indirect | high | 2026-06-17 | v0.4.0-rc1 | mc-lead-hunter-integ | No change until soak | Soak freeze | — | claude | high |
| android_master_controller | ACCEPTANCE | P1_REVENUE | indirect | high | 2026-06-17 | v0.4.0-rc1 | mc-lead-hunter-integ | Device smoke | Soak freeze | Device smoke | claude | high |
| mini_audit_10k | ACTIVE_DEVELOPMENT | P1_REVENUE | direct | high | 2026-06-16 | — | mc-lead-hunter-integ | One USE_NOW deliverable | — | Approve deliverable | claude | medium |
| revenue_os | ACTIVE_DEVELOPMENT | P1_REVENUE | direct | medium | 2026-06-15 | — | — | Safe summaries | — | — | claude | low |
| lead_hunter | ACTIVE_DEVELOPMENT | P2_INFRASTRUCTURE | enabler | medium | 2026-06-16 | — | mc-lead-hunter-integ | Credentials decision | API creds | Choose providers | claude | medium |
| kgbi_b2b_audit | ACTIVE_DEVELOPMENT | P2_INFRASTRUCTURE | direct | low | 2026-06-15 | — | — | Confirm scope | — | Confirm scope | claude | low |
| obsidian_hq | ACTIVE_DEVELOPMENT | P1_REVENUE | enabler | high | 2026-06-17 | — | hq-consolidation-v1 | Maintain | — | — | claude | low |
| reminder_secretary | ACTIVE_DEVELOPMENT | P3_PRODUCTIVITY | none | low | 2026-06-15 | — | — | Review items | — | — | cline | low |
| file_vault | MAINTENANCE | P2_INFRASTRUCTURE | none | medium | 2026-06-06 | — | — | Index on arrival | — | — | cline | medium |
| backup_dr | MAINTENANCE | P2_INFRASTRUCTURE | none | high | 2026-06-17 | — | hq-consolidation-v1 | Restore proof | — | — | claude | medium |
| chatgpt_pipeline | ACTIVE_DEVELOPMENT | P3_PRODUCTIVITY | none | low | 2026-06-17 | — | hq-consolidation-v1 | Fixtures-first import | — | — | cline | low |
| edera_rest_mini_audit | PAUSED | P3_PRODUCTIVITY | direct | low | — | — | — | Go/hold | — | Go/hold decision | claude | low |
| lead_gen_test_jbi | PAUSED | P3_PRODUCTIVITY | direct | low | — | — | — | Conclude/scale | Outreach approval | Outreach approval | claude | low |
| local_ai_hq | PLANNED | P4_RESEARCH | none | low | — | — | — | Workstation plan | Hardware | Hardware decision | owner | low |

## NOW (in progress / immediate)
- master_controller — 24h no-send soak (observe only).
- obsidian_hq / backup_dr — HQ consolidation v1 (this work, isolated worktree).

## NEXT (ready when soak closes)
- android_master_controller — owner/device smoke.
- master_controller — owner acceptance → controlled production prep.
- mini_audit_10k — one USE_NOW deliverable (no send).

## BLOCKED
- lead_hunter — external API credentials (owner).
- lead_gen_test_jbi — outreach approval (owner).
- local_ai_hq — hardware decision (owner).
- All production items — soak freeze (time-bound).

## REVENUE
- Direct: mini_audit_10k (P1), revenue_os (P1), kgbi_b2b_audit (P2), edera_rest, jbi.
- Enabler: lead_hunter (discovery), obsidian_hq (operations).

## INFRASTRUCTURE
- backup_dr, file_vault, lead_hunter, cline_integration, claude_code_integration, chatgpt_pipeline.

## ACCEPTANCE
- master_controller (v0.4.0-rc1), android_master_controller.

## ARCHIVE / placeholder
- Placeholders: boxon, kgbi_standalone, project_maria, strength_form_35, ai_content_factory.
- Sensitive (container-only): legal_documents, personal_assistant, file_vault_red.

## Freshness
Generated from `inventory_20260617_025903.json`. Regenerate after soak closes or after 7 days.
