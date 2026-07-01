---
type: master_index
status: canonical
related_project: obsidian_hq
last_updated: 2026-06-17
generated_from_inventory: inventory_20260617_025903.json
registry_version: 2.0
release_version: v0.4.0-rc1
freshness_days: 7
canonical_target: 00_MASTER_CONTEXT/WHAT_ALREADY_EXISTS.md
apply_status: PROPOSED_AFTER_SOAK
tags: [index, master_context, canonical]
---

# What Already Exists — Canonical Index

> Compact canonical index, **not** a journal. Each section links to ONE canonical detailed
> document. If you are an AI agent: read this first, then load only the linked document you need.
> Do not duplicate dashboards, registries, SOPs, or reports.

> ⚠️ **FRESHNESS:** valid for `freshness_days: 7` from `last_updated`. If older, regenerate via
> `node tools/ai_hq/inventory.mjs` and re-run `registry-validate`.

## 1. Current system status
Master Controller **v0.4.0-rc1** is in a **24h no-send soak** (production FREEZE). All HQ
consolidation work is local-only, read-only against production. Autosend BLOCKED, live send OFF.

## 2. Production systems
- Master Controller API (VPS, sole canonical writer) — soak in progress.
- Telegram Master Controller (API-only, send BLOCKED) — live backup channel.
- Android Mater Controller — release candidate, acceptance pending.
- Detail: [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]

## 3. Active development
Mini Audit 10K, Revenue OS, Lead Hunter, КЖБИ B2B Audit, Obsidian HQ, Reminder Secretary,
ChatGPT pipeline, Cline/Claude integration. Detail: [[00_MASTER_CONTEXT/PROJECT_REGISTRY]]

## 4. Current acceptance tests
- Master Controller v0.4.0-rc1 owner acceptance: [[09_dashboards/OWNER_ACCEPTANCE_CHECKLIST_v0.4.0-rc1_2026-06-17]]
- Android completeness: [[09_dashboards/ANDROID_RELEASE_COMPLETENESS_MATRIX_v0.4.0-rc1_2026-06-17]]

## 5. Paused projects
Edera Rest Mini Audit, JBI Krasnodar Lead-Gen Test (outreach approval pending).

## 6. Critical architecture rules
- VPS is the sole canonical writer; local tools never write production canonical store.
- One send seam, one ledger, one store. Autosend BLOCKED; client send OFF.
- Telegram + Android are API-only; no local business logic, no local secrets.
- Single Overpass implementation (Lead Hunter).
- No bidirectional sync. Obsidian = knowledge; VPS = operational truth.
- No mass orphan cleanup; secrets only in `D:\AI_SECRETS` / gitignored `.env`.
- Detail: [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]], [[00_MASTER_CONTEXT/DO_NOT_TOUCH]]

## 7. Current branches / tags / releases
- Release tag: `v0.4.0-rc1` (not moved).
- Production branch: `feature/master-controller-lead-hunter-integration` (HEAD `dd9a63a`).
- HQ consolidation branch (isolated worktree): `feature/ai-workspace-hq-consolidation-v1`.

## 8. Main dashboards
- [[09_dashboards/project_portfolio_dashboard]] — portfolio (NOW/NEXT/BLOCKED/REVENUE/...).
- [[09_dashboards/ai_operations_dashboard]] — operations.
- [[09_dashboards/project_health_dashboard]] — health.

## 9. Main SOP
- [[03_sop/ai_agent_governance_protocol]] — agent roles + handoff (canonical).
- [[03_sop/pre_task_context_gate]] — pre-task gate.
- [[03_sop/obsidian_graph_hygiene_protocol]] — graph hygiene.

## 10. Known blockers
- Soak FREEZE (production). External API credentials for Lead Hunter (owner).
- Outreach approval for JBI test (owner). Local AI workstation hardware (owner).

## 11. Current next major actions
- Complete soak → owner acceptance → controlled production prep (post-approval).
- Use context packs + task ledger for all agent work (anti-loop).

## 12. Links to detailed reports
- Final consolidation report: [[09_dashboards/AI_WORKSPACE_HQ_CONSOLIDATION_v1_REPORT]]
- Inventory: `_generated/ai_hq/inventory/inventory_latest.json`
- Decision register: [[00_MASTER_CONTEXT/current_decisions_index]]
- Task ledger: `_generated/ai_hq/task_ledger.jsonl`

## 13. Last updated
2026-06-17 (registry_version 2.0).

## 14. Freshness warning
If `last_updated` is more than `freshness_days` old, treat sections 1–11 as potentially stale and
regenerate the inventory before relying on counts/status.

---
### Preserved historical context (do not recreate)
Prior detailed entries (File Vault OS, Reminder Secretary OS, Mini Audit canonical contour,
Mater Controller Android, Obsidian Max Efficiency) remain in the dated backup
`_generated/ai_hq/backups/canonical_20260617_025903/00_MASTER_CONTEXT/WHAT_ALREADY_EXISTS.md`
and in the live file's history. This index links to their canonical homes rather than copying them.
