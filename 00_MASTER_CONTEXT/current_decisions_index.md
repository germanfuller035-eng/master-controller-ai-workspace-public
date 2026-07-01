

<!-- AI HQ consolidation addendum 20260617_000000 -->
---
type: decision_register
status: canonical
related_project: obsidian_hq
updated: 2026-06-17
canonical_target: 00_MASTER_CONTEXT/current_decisions_index.md
apply_status: PROPOSED_AFTER_SOAK
note: This is the SINGLE canonical decision register. The block below APPENDS rows 20-35 to the existing register (rows 1-19 preserved verbatim in the live file). Do not create a parallel register.
tags: [decisions, canonical]
---

# Current Decisions Index — Consolidation Addendum (rows 20–35)

> Append-only addendum to `00_MASTER_CONTEXT/current_decisions_index.md`. Existing rows 1–19
> remain unchanged. These are **confirmed** decisions (evidence-based), not proposals.

| # | Date | Decision | Reason | Alternatives | Consequences | Affected | Reverse? | Evidence |
|---|---|---|---|---|---|---|---|---|
| 20 | 2026-06-17 | VPS is the sole canonical writer | Single source of operational truth; avoid drift | local writer; dual-write | local tools read-only against prod | Master Controller, store | Only w/ approval | AI_SYSTEM_MAP |
| 21 | 2026-06-15 | Telegram is API-only | No local biz logic / secrets on device path | local bot logic | shared services reused | tools/telegram_gateway | Only w/ approval | dbdabd0 runbook |
| 22 | 2026-06-15 | Android is API-only | Same shared modules; no duplicated logic | native logic | Android via API envelope | apps/mater_controller_android | Only w/ approval | MATER_CONTROLLER_ANDROID_FINAL_REPORT |
| 23 | 2026-06-16 | Lead Hunter is the intelligence layer | Centralize discovery | scattered scrapers | one discovery path | tools/lead_hunter | Standing rule | LEAD_HUNTER_OS_REPORT |
| 24 | 2026-06-16 | One scheduler | Avoid double-scheduling | multiple cron paths | single scheduler owns timing | master_controller | Only w/ approval | integration reports |
| 25 | 2026-06-16 | One Overpass implementation | Reconcile duplicate runtimes | multiple Overpass | single adapter | lead_hunter | Only w/ approval | ab37976 |
| 26 | 2026-06-07 | Autosend BLOCKED | Every send human-gated | autosend | no unattended send | approved-send | Only w/ approval | rows 3/15 |
| 27 | 2026-06-07 | Live send OFF | Protect clients/deliverability | live send | dry-run/no-send only | send seam | Only w/ approval | row 6 |
| 28 | 2026-06-17 | No bidirectional sync | Obsidian≠operational truth | two-way sync | one-way knowledge/ops split | Obsidian/VPS | Standing rule | AI_SYSTEM_MAP |
| 29 | 2026-06-05 | Obsidian is the knowledge source | One control surface | scattered docs | registry/dashboards canonical | Obsidian HQ | Standing rule | OBSIDIAN_HQ_SETUP |
| 30 | 2026-06-17 | ChatGPT = strategy; Claude = large blocks; Cline = focused fallback | Clear role boundaries | overlap | governance protocol | agents | Standing rule | ai_agent_governance_protocol |
| 31 | 2026-06-15 | No mass orphan cleanup | Preserve historical value | bulk delete | index + classify only | ORPHAN_BACKLOG_INDEX | Standing rule | ASSET_SALVAGE_INDEX |
| 32 | 2026-06-12 | Secrets only in approved contour (D:\AI_SECRETS / .env) | Prevent leakage | secrets in notes | redaction enforced in tooling | all | Standing rule | gitignore + redact.mjs |
| 33 | 2026-06-17 | Release tags not moved without evidence | Stable release history | retag | tag v0.4.0-rc1 frozen | release | Only w/ approval | tag v0.4.0-rc1 |
| 34 | 2026-06-17 | One registry, one portfolio dashboard, one decision register | Avoid parallel systems | per-agent registries | consolidation v1 | Obsidian HQ | Standing rule | PROJECT_REGISTRY v2.0 |
| 35 | 2026-06-17 | HQ consolidation runs in isolated worktree, never the frozen vault | Protect soak | in-place edits | proposed-after-soak docs | worktree | Standing rule | PHASE0_ISOLATION_DECISION |

## Related
- [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
- [[00_MASTER_CONTEXT/PROJECT_REGISTRY]]
- [[03_sop/ai_agent_governance_protocol]]
