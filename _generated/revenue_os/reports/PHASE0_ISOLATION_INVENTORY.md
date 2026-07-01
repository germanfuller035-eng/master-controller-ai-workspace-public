# Revenue OS Command Center v1 — Phase 0-2: Isolation + Inventory

date: 2026-06-17
status: COMPLETE

## Isolation
- WORKTREE: `D:\AI_WORKSPACE_WORKTREES\revenue-os-command-center-v1`
- BRANCH: `feature/revenue-os-command-center-v1`
- BASE_COMMIT: `d4bf77f` (AI HQ HEAD)
- Live vault `D:\AI_WORKSPACE` = READ-ONLY (production soak freeze). Main tree `dd9a63a`, 1137 pending
  changes — untouched. Release tag `v0.4.0-rc1` not moved.
- All deliverables authored in the worktree under `tools/revenue_os/`, `_generated/revenue_os/`,
  `docs_canonical_proposed/<real-path>`. No write reaches the live vault. No deploy.

## AI HQ pre-task gate (Phase 1)
- context-pack generated: `revenue_os` (claude), 0 secrets, source_of_truth confirmed.
- task-ledger-validate: 7 tasks, 0 errors, 0 warnings.
- project-status revenue_os: ACTIVE_DEVELOPMENT / P1_REVENUE / source = `07_revenue_os/revenue_os_structure.md`.
- New ledger entry appended: `REVENUE_OS_COMMAND_CENTER_V1` (IN_PROGRESS, deployment=NO, mutations=NO).
- No duplicate/superseding/completed-identical task found.

## Revenue OS source of truth (confirmed)
- Canonical structure: `07_revenue_os/revenue_os_structure.md` (skeleton list of sheets only).
- **Canonical commercial materials (the real content) live in `13_sales/`:**
  - `audit_product_ladder.md` — 9-level product ladder (Express Review → Business Pack).
  - `pricing_scope_matrix.md` — pricing matrix, point-based formula, approval rules, prohibited claims.
  - `three_sellable_offers.md` — 3 concrete offers with confirmed prices.
  - `mini_audit_10k_product_spec.md` — Mini Audit spec.
  - `implementation_sprint_pricing.md` — sprint pricing tiers.
- Templates: `02_templates/commercial_offer_tiers_template.md`, `pricing_scorecard_template.md`.
- SOP/agent: `03_sop/pricing_scope_control_sop.md`, `04_agents/pricing_scope_controller_agent.md`.
- Dashboards: `09_dashboards/revenue_dashboard.md`, `revenue_pipeline_dashboard.md`, `money_revenue_board.md`.

## Confirmed pricing facts (evidence-based, from canonical files)
| Product | Confirmed price | Source |
| --- | --- | --- |
| Express Review | free (0 ₽) | pricing_scope_matrix.md L18 |
| Mini Audit 10K | 10 000 ₽ | three_sellable_offers.md L3, pricing_scope_matrix.md L19 |
| Mini Audit Plus | 20 000–30 000 ₽ | pricing_scope_matrix.md L20 |
| B2B UX+SEO Audit | 30 000–70 000 ₽ | pricing_scope_matrix.md L21 |
| Legal/Data Preliminary | 30 000–90 000 ₽ | pricing_scope_matrix.md L22 |
| Combined Audit | 70 000–150 000 ₽ | pricing_scope_matrix.md L23 |
| Implementation Sprint | 50 000–150 000 ₽ | implementation_sprint_pricing.md |
| Start Pack | 90 000–250 000 ₽ (alt: from 50 000 ₽) | pricing_scope_matrix.md L25 / three_sellable_offers.md L30 |
| Business Pack | 250 000 ₽+ | pricing_scope_matrix.md L26 |
| Website/Catalog | 180 000–350 000 ₽ | three_sellable_offers.md L59 |

Note: `Start Pack` shows two different ranges across files (50k vs 90-250k) → flagged as CONFLICT
for owner reconciliation; engine treats as range with owner approval required.

## Canonical approval rules (from pricing_scope_matrix.md §9)
Price requires owner approval if: above 10 000 ₽, any discount, instalments, price stated in a
letter, КП to be sent, "turnkey" request, legal/data risk, access work, or timeline promises.

## Prohibited claims (from §10) — enforced by Evidence Gate
No guarantees of: sales growth, lead growth, ROI, top rankings, no-fines; no legal opinion; no
"fix everything without client"; no timelines without access knowledge.

## Backup (Phase 0)
- 17 commercial source files → `_generated/revenue_os/backups/revenue_src_20260617_120000/`
- Manifest `revenue_src_20260617_120000_manifest.sha256`; restore-readability 17/17 OK.

## Anti-duplication decisions
- Do NOT create a second lead store / CRM / approval / send / ledger. Revenue OS = product/offer/
  pricing/economics layer only. Lead truth stays in Master Controller. One product catalog,
  one pricing source, one revenue dashboard.

## Invariants held (Phase 0-2)
```
VPS_CHANGES=0  PRODUCTION_SERVICE_RESTARTS=0  CANONICAL_WRITES=0
PRODUCTION_LEADS_CHANGED=0  EMAILS_SENT=0  CLIENT_MESSAGES_SENT=0  SMTP_CALLS=0
AUTOSEND=BLOCKED  SEND_ALLOWED_LIVE=OFF  RELEASE_TAG_UNCHANGED=YES  SOAK_TIMER_CHANGED=NO
```
