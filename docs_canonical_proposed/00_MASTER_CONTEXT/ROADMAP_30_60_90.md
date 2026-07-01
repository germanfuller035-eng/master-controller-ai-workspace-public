---
type: roadmap
status: canonical
related_project: obsidian_hq
updated: 2026-06-17
canonical_target: 00_MASTER_CONTEXT/ROADMAP_30_60_90.md
apply_status: PROPOSED_AFTER_SOAK
tags: [roadmap, planning]
---

# 30 / 60 / 90-Day Roadmap (canonical)

> One actionable roadmap. No exact dates where dependencies are unknown. Every item has
> deliverable, dependencies, risk, owner action, agent, done definition.

## 30 days — close the release, prepare controlled production

| Item | Project | Deliverable | Dependencies | Risk | Owner action | Agent | Done definition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Complete 24h no-send soak | master_controller | Soak observations clean | soak timer | low | watch alerts | claude | 24h elapsed, 0 sends, 0 errors |
| Owner acceptance | master_controller | Signed acceptance checklist | soak done | med | run checklist | owner | checklist ACCEPTED |
| Owner/device smoke | android_master_controller | Device smoke report | soak done | med | run on device | owner | smoke PASS |
| Git remote/publication decision | obsidian_hq | Remote policy doc | owner choice | low | choose remote | owner | policy recorded |
| Controlled production prep | master_controller | Prod readiness checklist | acceptance | high | approve plan | claude | checklist ready (no deploy) |
| Operational documentation | obsidian_hq | Runbooks current | none | low | review | claude | runbooks verified |
| First safe commercial cycle | mini_audit_10k | One paid-loop dry-run proof | separate approval | med | approve | claude | dry-run proven, no live send |

## 60 days — grow lead sources, reporting, product ladder

| Item | Project | Deliverable | Dependencies | Risk | Owner action | Agent | Done definition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Improve lead sources | lead_hunter | Multi-source discovery | API decision | med | choose providers | claude | sources integrated |
| Credentials for 2GIS/DataForSEO/Yandex | lead_hunter | Configured creds | owner accounts | med | provide creds | owner | creds present (in AI_SECRETS) |
| Reporting layer | revenue_os | Revenue reports | data | low | review | claude | reports generate |
| Product ladder | revenue_os | Offer ladder doc | owner pricing | low | set prices | owner | ladder defined |
| Conversation Hub planning | telegram_master_controller | Hub design doc | none | low | review | claude | design approved |
| Revenue measurement | revenue_os | Confirmed-numbers ledger | owner data | med | enter deals | owner | ledger populated |
| Owner workflow reduction | obsidian_hq | Automation of repetitive ops | stable prod | low | review | claude | steps reduced |

## 90 days — hardening, channels, local AI, DR maturity

| Item | Project | Deliverable | Dependencies | Risk | Owner action | Agent | Done definition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Production hardening | master_controller | Hardening checklist done | live prod | high | approve | claude | checklist complete |
| Additional channels | telegram_master_controller | New channel adapter | design | med | approve | claude | adapter live-proven |
| MAX evaluation | local_ai_hq | MAX eval report | hardware | low | decide | owner | eval documented |
| Official WhatsApp API eval | telegram_master_controller | WA API feasibility | business acct | med | provide acct | owner | eval documented |
| Local AI workstation plan | local_ai_hq | Build plan + budget | hardware budget | low | approve budget | owner | plan approved |
| Greater autonomous operations | master_controller | Expanded automation scope | prod stable | high | approve scope | claude | scope live-proven |
| Disaster recovery maturity | backup_dr | RPO/RTO targets met | backup infra | med | review targets | claude | targets validated |

## RPO/RTO targets (DR)
| Asset | RPO (max data loss) | RTO (max downtime) |
| --- | --- | --- |
| Production code | 1 commit / push cycle | < 1 hour (bundle restore) |
| Knowledge base (Obsidian) | 1 day (daily backup) | < 2 hours |
| Legal/sensitive files | manual checkpoint | best-effort (owner) |
| Release artifacts | per release | < 1 hour (re-download/rebuild) |
| Secrets | manual (encrypted only) | owner-managed |

## Related
- [[00_MASTER_CONTEXT/PROJECT_REGISTRY]]
- [[09_dashboards/ai_operations_dashboard]]
