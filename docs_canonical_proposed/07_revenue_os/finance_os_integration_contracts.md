---
type: integration_contract
status: proposed
related_project: finance-os
updated: 2026-06-17
canonical_target: 07_revenue_os/finance_os_integration_contracts.md
apply_status: PROPOSED_AFTER_SOAK
tags: [finance_os, integration, contracts, future]
---

# Finance OS — Integration Contracts (future, non-runtime)

> All contracts below are **future** and **non-runtime**. Nothing is implemented or deployed during
> the soak. Finance OS never mutates Revenue OS, Delivery OS, or Master Controller directly, never
> connects to a bank/payment provider, and never sends.

## Revenue OS contract (Phase 30)
- **Revenue OS provides** (read-only): deal ID, product, approved price, probability, expected close,
  payment terms, commercial status.
- **Finance OS returns** (advisory): forecast cash, margin estimate, payment risk, price viability,
  capacity/economic warning.
- No direct mutation. Future path: `Finance OS → Revenue OS API/contract → validation → owner approval → canonical business state`.

## Delivery OS contract (Phase 31)
- **Delivery OS provides** (read-only): project ID, scope, planned/actual hours, expenses, milestones,
  acceptance, change requests, delivery status.
- **Finance OS returns** (advisory): project profitability, invoice readiness, payment milestone status,
  margin risk, cash impact, scope-change financial impact.
- No direct mutation.

## Master Controller contract (Phase 32)
- **MC provides** (read-only): canonical lead ID, deal state, communication state, approved product,
  approved draft, reply status.
- **Finance OS provides** (advisory only): payment-risk recommendation, approved-invoice reference,
  receivable status summary, financial next-action recommendation.
- **Finance OS must NOT write**: lead status, send state, approval state, reply state, ledger.

## File Vault finance contract (Phase 29, dry-run only)
Routing for: invoices, payment confirmations, receipts, contracts, tax documents, bank statements,
expense evidence, budgets, close reports.
- Rules: hash · dedupe · sensitivity classification · restricted storage · **no credentials** ·
  **no full bank data in context packs** · source reference · retention · audit trail.
- Dry-run only; reuses AI HQ File Vault dry-run model (no second file system).

## Import contracts (Phase 34, future)
Safe dry-run import schemas for bank/accounting/payment-provider/invoice/expense CSV with mapping
preview, duplicate detection, normalization, sensitive-field redaction, unmatched queue, idempotency,
rollback. No live service connection.

## Project Registry proposal
Proposed `finance-os` entry (`_generated/finance_os/reports/registry_proposal.json`) — resolves the
ledger warning. Not written to canonical registry during soak.

## Related
- [[07_revenue_os/revenue_os_command_center]] · [[07_revenue_os/delivery_os_command_center]]
- [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
