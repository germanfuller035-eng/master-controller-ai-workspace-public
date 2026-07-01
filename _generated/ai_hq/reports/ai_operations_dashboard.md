---
type: dashboard
status: canonical
related_project: obsidian_hq
updated: 20260617_025903
generated_from_inventory: AI_WORKSPACE (20260617_025903)
canonical_target: 09_dashboards/ai_operations_dashboard.md
apply_status: PROPOSED_AFTER_SOAK
tags: [dashboard, operations]
---

# AI Operations Dashboard (canonical, generated)

> Generated from live data — do not hand-edit facts. Regenerate: `node tools/ai_hq/dashboard.mjs`. Freshness stamp: 20260617_025903.

## Production status
- Master Controller v0.4.0-rc1 — **24h no-send soak (FREEZE)**. Autosend BLOCKED, live send OFF.
- Telegram (API-only) live backup channel. Android release candidate (acceptance pending).

## Acceptance in progress
- master_controller: Complete 24h no-send soak; owner acceptance; then controlled production prep
- android_master_controller: Owner/device smoke; release closure after soak

## Current soak
- v0.4.0-rc1 no-send soak — observe only; no production changes.

## Active projects
- mini_audit_10k (P1_REVENUE) — Pick one USE_NOW deliverable (no send)
- lead_hunter (P2_INFRASTRUCTURE) — Credentials decision for 2GIS/DataForSEO/Yandex (owner)
- obsidian_hq (P1_REVENUE) — Maintain; one real task at a time
- reminder_secretary (P3_PRODUCTIVITY) — Review reminders/deadlines
- revenue_os (P1_REVENUE) — Safe dashboards/summaries only (no outreach)
- kgbi_b2b_audit (P2_INFRASTRUCTURE) — Review audit_plan; confirm deliverable scope
- chatgpt_pipeline (P3_PRODUCTIVITY) — Offline idempotent import pipeline (fixtures first)
- cline_integration (P3_PRODUCTIVITY) — Use context packs + handoff protocol
- claude_code_integration (P3_PRODUCTIVITY) — Use context pack builder + task ledger

## Task ledger summary
- Total tasks: 7. By status: DEPLOYED=2, LIVE_VERIFIED=1, TESTED=1, IMPLEMENTED=1, ACCEPTED=1, IN_PROGRESS=1
  - master_controller-002: LIVE_VERIFIED — Post-release acceptance: metadata/counts/Overpass reconciled, soak started
  - android_master_controller-001: TESTED — Android v0.4.0-rc1 validated — signed APK/AAB, 33 tests green, no-send proven
  - telegram_master_controller-001: DEPLOYED — Telegram API-only owner UX deployed (single poller, send blocked)
  - lead_hunter-001: IMPLEMENTED — Overpass runtime reconciled to ONE implementation
  - obsidian_hq-001: ACCEPTED — Obsidian Maximum Efficiency Upgrade (registry, dashboards, standards, health 90/100)
  - obsidian_hq-002: IN_PROGRESS — AI Operations HQ consolidation v1 (inventory, registry v2, context packs, governance, ledgers, backups, security, roadmap)

## Owner actions
- lead_hunter: External API credentials (owner action)
- lead_gen_test_jbi: Outreach approval (owner)
- local_ai_hq: Hardware decision (owner)
- legal_documents: Owner-only
- personal_assistant: Owner-only
- file_vault_red: Owner-only

## External blockers
- none currently (freeze is time-bound, not external).

## Backup health
- Canonical backup: 771 files, sha256 manifest, restore verified 771/771 OK.
- Git bundle: created + verified (12 refs), restore-test PASS.

## Security health
- Secret scan: critical_tracked=0, history clean. Findings (loc only): 3094.

## Orphans / duplicates
- New operational orphans: 659. Duplicate groups: 2060. MASS_DELETION=NO.

## Revenue focus
- Top revenue: mini_audit_10k. Top infrastructure: lead_hunter. Pause candidate: edera_rest_mini_audit.

## Recent decisions
- VPS sole canonical writer; Telegram/Android API-only; one Overpass; autosend BLOCKED; one registry/dashboard/decision-register. See [[00_MASTER_CONTEXT/current_decisions_index]].

## Recent completed milestones
- v0.4.0-rc1 release closure (reboot recovery PASS, no-send proven). Android 33 tests green.
- AI HQ Consolidation v1 (this work): inventory, registry v2, context packs, governance, ledgers, backups, security, roadmap.
