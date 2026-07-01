---
type: project_registry
status: active
related_project: obsidian_hq
updated: 2026-06-17
registry_version: 2.0
generated_from_inventory: inventory_20260617_025903.json
release_version: v0.4.0-rc1
tags:
  - project
  - registry
canonical_target: 00_MASTER_CONTEXT/PROJECT_REGISTRY.md
apply_status: PROPOSED_AFTER_SOAK
supersedes: registry_version 1.x (2026-06-15)
---

# Project Registry (canonical)

Source of truth for the list of projects in `D:\AI_WORKSPACE`. Evidence-based (real files/activity,
confirmed against `inventory_20260617_025903.json`). Sensitive projects appear as container-only
placeholders. Unified status/priority vocabularies (AI HQ Consolidation v1).

> This file is the **single** canonical registry. Do not create a parallel registry.
> Registry v1.x (2026-06-15, 8 projects) is **superseded** by this v2.0 (adds platform/interface
> projects: Master Controller, Telegram MC, Android MC, Lead Hunter, ChatGPT pipeline, Backup/DR,
> Local AI, Cline/Claude integration). No project was removed.

## Status vocabulary
`ACTIVE_PRODUCTION` · `ACTIVE_DEVELOPMENT` · `ACCEPTANCE` · `PAUSED` · `BLOCKED_EXTERNAL` · `PLANNED` · `MAINTENANCE` · `ARCHIVED` · `SENSITIVE_READ_ONLY` · `UNKNOWN`

## Priority vocabulary
`P0_CRITICAL` · `P1_REVENUE` · `P2_INFRASTRUCTURE` · `P3_PRODUCTIVITY` · `P4_RESEARCH` · `P5_ARCHIVE`

## Platform & Interfaces (production-critical)

| Project ID | Project | Status | Priority | Production | Source of truth | Owner | Risk | Next major action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| master_controller | Master Controller (v0.4.0-rc1) | ACCEPTANCE | P0_CRITICAL | PRODUCTION_SOAK | VPS API + canonical JSON store | claude | high | Complete 24h no-send soak → owner acceptance |
| telegram_master_controller | Telegram Master Controller (API-only) | ACTIVE_PRODUCTION | P0_CRITICAL | LIVE_BACKUP_CHANNEL | tools/telegram_gateway | claude | high | No UX changes until soak closes (FREEZE) |
| android_master_controller | Mater Controller Android | ACCEPTANCE | P1_REVENUE | RELEASE_CANDIDATE | apps/mater_controller_android | claude | high | Owner/device smoke; release closure after soak |

## Active development / build / test

| Project ID | Project | Status | Priority | Source of truth | Owner | Next major action |
| --- | --- | --- | --- | --- | --- | --- |
| mini_audit_10k | Mini Audit 10K | ACTIVE_DEVELOPMENT | P1_REVENUE | 13_sales/lead_pipeline_store.json | claude | Pick one USE_NOW deliverable (no send) |
| revenue_os | Revenue OS / Sales | ACTIVE_DEVELOPMENT | P1_REVENUE | 07_revenue_os/revenue_os_structure.md | claude | Safe dashboards/summaries only |
| lead_hunter | Lead Hunter (discovery) | ACTIVE_DEVELOPMENT | P2_INFRASTRUCTURE | tools/lead_hunter | claude | Owner credentials decision (2GIS/DataForSEO/Yandex) |
| kgbi_b2b_audit | КЖБИ B2B Audit | ACTIVE_DEVELOPMENT | P2_INFRASTRUCTURE | 06_projects/kgbi_b2b_audit | claude | Confirm deliverable scope |
| obsidian_hq | Obsidian / AI_WORKSPACE HQ | ACTIVE_DEVELOPMENT | P1_REVENUE | PROJECT_REGISTRY + WHAT_ALREADY_EXISTS | claude | Maintain; one task at a time |
| reminder_secretary | Reminder Secretary OS | ACTIVE_DEVELOPMENT | P3_PRODUCTIVITY | 12_reminders/ | cline | Review reminders/deadlines |
| chatgpt_pipeline | ChatGPT Export/Import Pipeline | ACTIVE_DEVELOPMENT | P3_PRODUCTIVITY | tools/chatgpt_export + 00_IMPORTS | cline | Offline idempotent import (fixtures first) |
| cline_integration | Cline Integration | ACTIVE_DEVELOPMENT | P3_PRODUCTIVITY | 04_cline/CLINE_OPERATING_LAYER_INDEX.md | cline | Use context packs + handoff protocol |
| claude_code_integration | Claude Code Integration | ACTIVE_DEVELOPMENT | P3_PRODUCTIVITY | tools/ai_hq + governance SOP | claude | Use context pack builder + task ledger |

## Infrastructure / maintenance

| Project ID | Project | Status | Priority | Source of truth | Owner | Next major action |
| --- | --- | --- | --- | --- | --- | --- |
| file_vault | Personal File Vault (index-only) | MAINTENANCE | P2_INFRASTRUCTURE | 20_file_vault_index (files in D:\AI_FILE_VAULT) | cline | Index only when new files arrive |
| backup_dr | Backup / Disaster Recovery | MAINTENANCE | P2_INFRASTRUCTURE | D:\AI_BACKUPS + git bundles | claude | Manifest + checksum + restore proof |

## Paused

| Project ID | Project | Status | Priority | Reason | Resume condition |
| --- | --- | --- | --- | --- | --- |
| edera_rest_mini_audit | Edera Rest Mini Audit | PAUSED | P3_PRODUCTIVITY | Lower priority | Owner go/hold decision |
| lead_gen_test_jbi | JBI Krasnodar Lead-Gen Test | PAUSED | P3_PRODUCTIVITY | Needs outreach approval | Owner outreach approval |

## Planned / research

| Project ID | Project | Status | Priority | Next major action |
| --- | --- | --- | --- | --- |
| local_ai_hq | Local AI models / HQ workstation | PLANNED | P4_RESEARCH | 90-day workstation plan (owner hardware decision) |

## Sensitive / placeholder (container-only)

High-level placeholders only — no sensitive content, index-only, not read, never in shared context packs.

| Project ID | Project | Status | Note |
| --- | --- | --- | --- |
| legal_documents | Legal Documents | SENSITIVE_READ_ONLY | `15_legal_documents` — container index only |
| personal_assistant | Personal Assistant | SENSITIVE_READ_ONLY | `13_personal_assistant` — personal data, no summaries |
| file_vault_red | File Vault RED (military/medical/identity) | SENSITIVE_READ_ONLY | RED docs + VVK folder index-only, approval-gated |
| boxon | BOXON (шины/хранение) | PLANNED | `18_boxon` placeholder until real files |
| kgbi_standalone | КЖБИ (standalone) | PLANNED | `19_kgbi` empty; work tracked under kgbi_b2b_audit |
| project_maria | Проект Марии | PLANNED | `20_project_maria` placeholder |
| strength_form_35 | Силовая форма 35+ | PLANNED | `21_strength_form_35` / `16_fitness_products` placeholder |
| ai_content_factory | AI Content Factory | PLANNED | `14_content_factory` placeholder |

## Rules
- This registry is the **single** source of truth for the project list. Add a row before creating a passport.
- Evidence required: real files or activity. No empty projects for count.
- Do not add sensitive content here. Sensitive projects stay container-only.
- A passport is created only for projects with real files/activity/goal.
- Statuses/priorities use the unified vocabularies above.

## Related
- [[00_MASTER_CONTEXT/WHAT_ALREADY_EXISTS]]
- [[09_dashboards/project_portfolio_dashboard]]
- [[09_dashboards/ai_operations_dashboard]]
- [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
- [[00_MASTER_CONTEXT/CLINE_OBSIDIAN_EFFICIENCY_CONSTITUTION]]
