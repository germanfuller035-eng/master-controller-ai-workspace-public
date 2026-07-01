---
type: system_map
status: canonical
related_project: obsidian_hq
updated: 2026-06-17
registry_version: 2.0
release_version: v0.4.0-rc1
canonical_target: 00_MASTER_CONTEXT/AI_SYSTEM_MAP.md
apply_status: PROPOSED_AFTER_SOAK
tags: [system, map, architecture, governance]
---

# AI System Map (canonical)

Single canonical map of how the AI Operations HQ components connect, who may write canonical
data, and where secrets / artifacts / backups / context live.

## Flow

```text
ChatGPT
  ↓ strategy / architecture / master prompts / acceptance criteria / risk review
Claude Code
  ↓ large autonomous implementation blocks / tests / commits / live verification
Cline
  ↓ focused local implementation / emergency repair / offline scripts
Git
  ↓ source history (code/tools only — Obsidian vault is NOT tracked)
Obsidian (AI_WORKSPACE vault)
  ↓ knowledge + operational control (registry, dashboards, decisions, handoffs)
File Vault (D:\AI_FILE_VAULT)
  ↓ document intake and evidence (index-only in Obsidian)
Master Controller API (VPS 195.96.132.82)
  ↓ production operational truth (sole canonical writer)
Telegram (mctelegram, API-only)
  ↓ owner backup interface (send BLOCKED)
Android (Mater Controller)
  ↓ primary owner interface (API-only)
Lead Hunter
  ↓ discovery intelligence (single Overpass implementation)
Revenue OS
  ↓ commercial performance (index/summaries only)
Backups (D:\AI_BACKUPS + git bundles)
  ↓ recovery
```

## Component contracts

| Component | Responsibility | Source of truth | Writes allowed | Reads allowed | Forbidden | Auth boundary | Deploy state | Failure impact | Fallback | Monitoring | Owner interaction |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | Strategy, architecture, master prompts | conversation + Obsidian | none (advice only) | summaries/context packs | direct prod actions | none | n/a | low (advisory) | Claude judgment | n/a | high |
| Claude Code | Large implementation blocks, tests, deploy when permitted | code repo | code repo, generated dirs | whole workspace (read) | prod deploy during freeze | local + approved creds | local | medium | Cline | task ledger | medium |
| Cline | Focused local edits, recovery | code repo | scoped files | scoped context | architecture rewrites | local | local | low | Claude | cline reports | medium |
| Git | Source history | repo | code/tools | code/tools | force-push without approval | local | n/a | medium | bundles | git log | low |
| Obsidian | Knowledge + control | PROJECT_REGISTRY + WHAT_ALREADY_EXISTS | vault md (owner/agent) | vault | secrets in notes | local FS | operational | medium | backups | health dashboard | high |
| File Vault | Document evidence | D:\AI_FILE_VAULT + index | index cards only | index | content read/OCR without approval | local FS | index-only | low | re-index | file_vault_dashboard | medium |
| Master Controller API | Production operational truth | VPS + canonical store | **VPS only (sole writer)** | API reads | local writes to canonical store | SSH + API secret | PRODUCTION (soak) | critical | rollback runbook | soak observations | low (freeze) |
| Telegram | Owner backup interface | gateway state | drafts/approvals | API | client send (BLOCKED) | bot token | LIVE | medium | Android | bot heartbeat | high |
| Android | Primary owner interface | app + API | via API | API | local biz logic | API secret | RELEASE_CANDIDATE | medium | Telegram | build info | high |
| Lead Hunter | Discovery intelligence | tools/lead_hunter | discovery data | sources | duplicate Overpass impls | API creds (absent) | build/test | low | manual CSV | reports | low |
| Revenue OS | Commercial performance | 07_revenue_os | summaries | leads (read) | real outreach | none | index | low | manual | revenue_dashboard | medium |
| Backups | Recovery | D:\AI_BACKUPS | backup dirs | all | unencrypted secrets in backups | local FS | operational | high if absent | git bundle | backup_verify | low |

## Canonical write authority

- **Production operational truth:** VPS Master Controller API is the **sole canonical writer**.
  Local tools/Obsidian never write the production canonical store.
- **Project list/status canonical data:** `00_MASTER_CONTEXT/PROJECT_REGISTRY.md` (single registry).
- **System status index:** `00_MASTER_CONTEXT/WHAT_ALREADY_EXISTS.md` (compact index, links out).
- **Who CANNOT write canonical data:** ChatGPT (advisory), Cline (scoped only), dashboards
  (read-only projections), Android/Telegram (via API only, never local files).

## Where things live

| Concern | Location | Notes |
| --- | --- | --- |
| Secrets | `D:\AI_SECRETS` + `.env` (gitignored) | Never in Obsidian / context packs / Git / reports |
| Generated artifacts | `_generated/` (worktree) and `dist/` | Not canonical; reproducible |
| Backups | `D:\AI_BACKUPS` + `.gitbundle` | Manifest + checksum + restore proof |
| Project context | `02_context_packs/` + `_generated/ai_hq/context_packs/` | Compact, secret-free |
| Task history | `_generated/ai_hq/task_ledger.jsonl` | Anti-loop ledger (milestones only) |
| Decisions | `00_MASTER_CONTEXT/current_decisions_index.md` (canonical) | Single decision register |

## Freeze boundary (during v0.4.0-rc1 soak)
VPS, Master Controller API, canonical store, job queue, scheduler, worker, IMAP, Telegram/Android
runtime, release tag, soak timer, backup timers, Caddy/UFW/fail2ban, prod credentials, lead data,
and all ledgers are **frozen**. HQ consolidation is local-only and read-only against these.

## Related
- [[00_MASTER_CONTEXT/PROJECT_REGISTRY]]
- [[00_MASTER_CONTEXT/WHAT_ALREADY_EXISTS]]
- [[09_dashboards/ai_operations_dashboard]]
- [[03_sop/ai_agent_governance_protocol]]
